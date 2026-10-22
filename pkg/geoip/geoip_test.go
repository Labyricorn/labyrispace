// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package geoip

import (
	"errors"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/maxmind/mmdbwriter"
	"github.com/maxmind/mmdbwriter/mmdbtype"
	"github.com/wavetermdev/waveterm/pkg/ipkind"
)

func writeDB(t *testing.T, path string, entries map[string]mmdbtype.Map) {
	t.Helper()
	writer, err := mmdbwriter.New(mmdbwriter.Options{DatabaseType: "Test-Country", IncludeReservedNetworks: true, RecordSize: 24})
	if err != nil {
		t.Fatal(err)
	}
	for cidr, rec := range entries {
		_, network, err := net.ParseCIDR(cidr)
		if err != nil {
			t.Fatal(err)
		}
		if err := writer.Insert(network, rec); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if _, err := writer.WriteTo(f); err != nil {
		t.Fatal(err)
	}
}

func country(code string, name string) mmdbtype.Map {
	return mmdbtype.Map{"country": mmdbtype.Map{"iso_code": mmdbtype.String(code), "names": mmdbtype.Map{"en": mmdbtype.String(name)}}}
}

func TestLookupPlacesPublicAddressesOnly(t *testing.T) {
	path := filepath.Join(t.TempDir(), "db.mmdb")
	writeDB(t, path, map[string]mmdbtype.Map{
		"203.0.113.0/24": country("ZZ", "Testland"),
		"10.0.0.0/8":     country("PP", "Should Never Appear"),
		"127.0.0.0/8":    country("LL", "Should Never Appear"),
	})
	store := &Store{}
	got, err := store.Lookup(path, []string{"203.0.113.9", "10.1.2.3", "127.0.0.1", "8.8.8.8", "not-an-ip", " 203.0.113.10 ", "::ffff:203.0.113.11"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 7 {
		t.Fatalf("expected 7 results, got %d", len(got))
	}
	if !got[0].Found || got[0].CountryCode != "ZZ" || got[0].CountryName != "Testland" || got[0].Kind != ipkind.Public {
		t.Errorf("public address not placed: %+v", got[0])
	}
	for _, i := range []int{1, 2} {
		if got[i].Found || got[i].CountryCode != "" {
			t.Errorf("local address %s must never be looked up: %+v", got[i].IP, got[i])
		}
	}
	if got[1].Kind != ipkind.Private || got[2].Kind != ipkind.Loopback {
		t.Errorf("kinds wrong: %q %q", got[1].Kind, got[2].Kind)
	}
	if got[3].Found || got[3].Kind != ipkind.Public {
		t.Errorf("a public address missing from the database is not found: %+v", got[3])
	}
	if got[4].Kind != KindInvalid || got[4].Found {
		t.Errorf("invalid input: %+v", got[4])
	}
	if !got[5].Found || got[5].IP != "203.0.113.10" {
		t.Errorf("whitespace should be trimmed: %+v", got[5])
	}
	if !got[6].Found || got[6].IP != "203.0.113.11" {
		t.Errorf("an IPv4-mapped IPv6 address is the IPv4 address: %+v", got[6])
	}
}

func TestLookupReturnsCoordinatesWhenTheDatabaseHasThem(t *testing.T) {
	path := filepath.Join(t.TempDir(), "city.mmdb")
	writeDB(t, path, map[string]mmdbtype.Map{
		"2001:db8::/32": {
			"country":  mmdbtype.Map{"iso_code": mmdbtype.String("YY")},
			"location": mmdbtype.Map{"latitude": mmdbtype.Float64(1.5), "longitude": mmdbtype.Float64(-2.5)},
		},
	})
	got, err := (&Store{}).Lookup(path, []string{"2001:db8::7"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || !got[0].Found || got[0].Latitude == nil || got[0].Longitude == nil || *got[0].Latitude != 1.5 || *got[0].Longitude != -2.5 {
		t.Fatalf("unexpected result %+v", got)
	}
}

func TestLookupReloadsAChangedFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "db.mmdb")
	writeDB(t, path, map[string]mmdbtype.Map{"203.0.113.0/24": country("AA", "First")})
	store := &Store{}
	first, err := store.Lookup(path, []string{"203.0.113.1"})
	if err != nil || first[0].CountryCode != "AA" {
		t.Fatalf("first lookup: %v %+v", err, first)
	}
	writeDB(t, path, map[string]mmdbtype.Map{"203.0.113.0/24": country("BB", "Second Edition")})
	later := time.Now().Add(5 * time.Second)
	os.Chtimes(path, later, later)
	second, err := store.Lookup(path, []string{"203.0.113.1"})
	if err != nil || second[0].CountryCode != "BB" {
		t.Fatalf("changed database was not reloaded: %v %+v", err, second)
	}
}

func TestLookupErrors(t *testing.T) {
	dir := t.TempDir()
	if _, err := (&Store{}).Lookup(filepath.Join(dir, "missing.mmdb"), []string{"8.8.8.8"}); !errors.Is(err, ErrNoDatabase) {
		t.Errorf("expected ErrNoDatabase, got %v", err)
	}
	broken := filepath.Join(dir, "broken.mmdb")
	os.WriteFile(broken, []byte("this is not a database"), 0600)
	if _, err := (&Store{}).Lookup(broken, []string{"8.8.8.8"}); err == nil || !strings.Contains(err.Error(), "could not be read") {
		t.Errorf("expected a read error, got %v", err)
	}
	ok := filepath.Join(dir, "ok.mmdb")
	writeDB(t, ok, map[string]mmdbtype.Map{"203.0.113.0/24": country("AA", "A")})
	tooMany := make([]string, MaxLookups+1)
	for i := range tooMany {
		tooMany[i] = "203.0.113.1"
	}
	if _, err := (&Store{}).Lookup(ok, tooMany); err == nil {
		t.Error("a batch over the limit must be refused")
	}
	if _, err := (&Store{}).Lookup(ok, make([]string, MaxLookups)); err != nil {
		t.Errorf("a full batch should work: %v", err)
	}
}

func TestLabelsAreCleaned(t *testing.T) {
	path := filepath.Join(t.TempDir(), "db.mmdb")
	writeDB(t, path, map[string]mmdbtype.Map{"203.0.113.0/24": country("Z\r\nZ", "Test\x1b[2Jland")})
	got, err := (&Store{}).Lookup(path, []string{"203.0.113.1"})
	if err != nil || len(got) != 1 {
		t.Fatal(err)
	}
	if strings.ContainsAny(got[0].CountryCode+got[0].CountryName, "\r\n\x1b") {
		t.Errorf("control characters leaked: %+v", got[0])
	}
	if cleaned := cleanLabel("a\r\nb\x00c"); cleaned != "abc" {
		t.Errorf("cleanLabel gave %q", cleaned)
	}
	if invalid := cleanLabel("bad\r\ninput"); strings.ContainsAny(invalid, "\r\n") {
		t.Errorf("cleanLabel left control characters: %q", invalid)
	}
}

func TestResolveDatabasePathPrefersTheUserFile(t *testing.T) {
	root := t.TempDir()
	if _, _, err := ResolveDatabasePath(root, "network-globe"); !errors.Is(err, ErrNoDatabase) {
		t.Fatalf("expected ErrNoDatabase, got %v", err)
	}
	downloaded := filepath.Join(root, "widgets-data", "network-globe", "downloads", DownloadedDatabaseID)
	writeDB(t, downloaded, map[string]mmdbtype.Map{"203.0.113.0/24": country("AA", "A")})
	path, source, err := ResolveDatabasePath(root, "network-globe")
	if err != nil || path != downloaded || source != SourceDownloaded {
		t.Fatalf("downloaded database: %q %q %v", path, source, err)
	}
	user := filepath.Join(root, "widgets-data", "network-globe", UserDatabaseName)
	writeDB(t, user, map[string]mmdbtype.Map{"203.0.113.0/24": country("BB", "B")})
	path, source, err = ResolveDatabasePath(root, "network-globe")
	if err != nil || path != user || source != SourceUser {
		t.Fatalf("user database should win: %q %q %v", path, source, err)
	}
	if _, _, err := ResolveDatabasePath(root, "../evil"); err == nil {
		t.Error("an invalid widget id must be refused")
	}
}
