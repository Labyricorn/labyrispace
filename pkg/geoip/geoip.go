// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package geoip

import (
	"errors"
	"fmt"
	"net/netip"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	maxminddb "github.com/oschwald/maxminddb-golang/v2"
	"github.com/wavetermdev/waveterm/pkg/assetdl"
	"github.com/wavetermdev/waveterm/pkg/ipkind"
)

const (
	MaxLookups           = 500
	MaxDatabaseBytes     = 256 * 1024 * 1024
	UserDatabaseName     = "user-geo.mmdb"
	DownloadedDatabaseID = "geo-country"

	SourceUser       = "user"
	SourceDownloaded = "downloaded"

	KindInvalid = "invalid"
)

var ErrNoDatabase = errors.New("no geolocation database is installed")

type Location struct {
	IP          string   `json:"ip"`
	Kind        string   `json:"kind"`
	Found       bool     `json:"found"`
	CountryCode string   `json:"countrycode,omitempty"`
	CountryName string   `json:"countryname,omitempty"`
	Latitude    *float64 `json:"latitude,omitempty"`
	Longitude   *float64 `json:"longitude,omitempty"`
}

// record covers the fields shared by MaxMind and DB-IP country and city databases. Country databases carry no
// coordinates, so Latitude and Longitude stay nil for them.
type record struct {
	Country struct {
		ISOCode string            `maxminddb:"iso_code"`
		Names   map[string]string `maxminddb:"names"`
	} `maxminddb:"country"`
	Location struct {
		Latitude  *float64 `maxminddb:"latitude"`
		Longitude *float64 `maxminddb:"longitude"`
	} `maxminddb:"location"`
}

// Store keeps one database open and reopens it when the file changes. Lookups read the local file only.
type Store struct {
	mu     sync.Mutex
	path   string
	size   int64
	mod    time.Time
	reader *maxminddb.Reader
}

var DefaultStore = &Store{}

func (s *Store) open(path string) (*maxminddb.Reader, error) {
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNoDatabase
		}
		return nil, err
	}
	if s.reader != nil && s.path == path && s.size == info.Size() && s.mod.Equal(info.ModTime()) {
		return s.reader, nil
	}
	if s.reader != nil {
		s.reader.Close()
		s.reader = nil
	}
	// The file is read into memory instead of mapped, because a mapped file cannot be replaced on Windows.
	if info.Size() > MaxDatabaseBytes {
		return nil, fmt.Errorf("the geolocation database is too large")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	reader, err := maxminddb.OpenBytes(data)
	if err != nil {
		return nil, fmt.Errorf("the geolocation database could not be read: %w", err)
	}
	s.reader, s.path, s.size, s.mod = reader, path, info.Size(), info.ModTime()
	return reader, nil
}

func cleanLabel(text string) string {
	text = strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, text)
	if len(text) > 64 {
		text = text[:64]
	}
	return text
}

// Lookup places public addresses. Private, loopback and other local addresses are classified but never looked up.
func (s *Store) Lookup(path string, ips []string) ([]Location, error) {
	if len(ips) > MaxLookups {
		return nil, fmt.Errorf("at most %d addresses can be looked up at once", MaxLookups)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	reader, err := s.open(path)
	if err != nil {
		return nil, err
	}
	results := make([]Location, 0, len(ips))
	for _, raw := range ips {
		addr, parseErr := netip.ParseAddr(strings.TrimSpace(raw))
		if parseErr != nil {
			results = append(results, Location{IP: cleanLabel(raw), Kind: KindInvalid})
			continue
		}
		addr = addr.Unmap()
		loc := Location{IP: addr.String(), Kind: ipkind.Classify(addr)}
		if loc.Kind == ipkind.Public {
			var rec record
			res := reader.Lookup(addr)
			if res.Err() == nil && res.Found() && res.Decode(&rec) == nil {
				loc.Found = rec.Country.ISOCode != "" || rec.Location.Latitude != nil
				loc.CountryCode = cleanLabel(rec.Country.ISOCode)
				loc.CountryName = cleanLabel(rec.Country.Names["en"])
				loc.Latitude, loc.Longitude = rec.Location.Latitude, rec.Location.Longitude
			}
		}
		results = append(results, loc)
	}
	return results, nil
}

// ResolveDatabasePath prefers a file the user supplied over the downloaded one.
func ResolveDatabasePath(dataDir string, widgetID string) (string, string, error) {
	downloaded, err := assetdl.DestPathFor(dataDir, widgetID, DownloadedDatabaseID)
	if err != nil {
		return "", "", err
	}
	user := filepath.Join(filepath.Dir(filepath.Dir(downloaded)), UserDatabaseName)
	if info, err := os.Stat(user); err == nil && !info.IsDir() {
		return user, SourceUser, nil
	}
	if info, err := os.Stat(downloaded); err == nil && !info.IsDir() {
		return downloaded, SourceDownloaded, nil
	}
	return "", "", ErrNoDatabase
}
