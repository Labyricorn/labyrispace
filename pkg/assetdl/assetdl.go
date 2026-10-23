// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package assetdl

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/Labyricorn/labyrispace/pkg/vendorpolicy"
)

const (
	DownloadTimeout = 15 * time.Minute
	MaxAllowedBytes = 512 * 1024 * 1024
)

var (
	widgetIdRegexp = regexp.MustCompile(`^[a-z][a-z0-9-]{1,40}$`)
	assetIdRegexp  = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{0,60}$`)
	sha256Regexp   = regexp.MustCompile(`^[0-9a-fA-F]{64}$`)
)

type Request struct {
	URL               string
	SHA256            string
	MaxBytes          int64
	DestPath          string
	AllowLoopbackHTTP bool
}

type Result struct {
	Bytes  int64
	SHA256 string
}

func ValidateIds(widgetId string, assetId string) error {
	if !widgetIdRegexp.MatchString(widgetId) {
		return fmt.Errorf("invalid widget id")
	}
	if !assetIdRegexp.MatchString(assetId) {
		return fmt.Errorf("invalid asset id")
	}
	return nil
}

// DestPathFor keeps every widget file under its own folder; the ids are validated so no path can escape it.
func DestPathFor(dataDir string, widgetId string, assetId string) (string, error) {
	if err := ValidateIds(widgetId, assetId); err != nil {
		return "", err
	}
	return filepath.Join(dataDir, "widgets-data", widgetId, "downloads", assetId), nil
}

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func checkURL(raw string, allowLoopbackHTTP bool) (*url.URL, error) {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" {
		return nil, fmt.Errorf("invalid download address")
	}
	switch parsed.Scheme {
	case "https":
	case "http":
		if !(allowLoopbackHTTP && isLoopbackHost(parsed.Hostname())) {
			return nil, fmt.Errorf("downloads must use https")
		}
	default:
		return nil, fmt.Errorf("downloads must use https")
	}
	if parsed.User != nil {
		return nil, fmt.Errorf("download address must not contain credentials")
	}
	return parsed, nil
}

func makeClient() *http.Client {
	return &http.Client{
		Timeout:   DownloadTimeout,
		Transport: &vendorpolicy.BlockingTransport{Base: http.DefaultTransport},
		// A redirect could move the download to a host the user never approved.
		CheckRedirect: func(req *http.Request, via []*http.Request) error { return http.ErrUseLastResponse },
	}
}

// Download fetches one file from the single approved address, checks its size and SHA-256, and only then
// moves it into place. A failed check leaves nothing behind at DestPath.
func Download(ctx context.Context, req Request) (*Result, error) {
	if !sha256Regexp.MatchString(req.SHA256) {
		return nil, fmt.Errorf("a SHA-256 is required")
	}
	if req.MaxBytes <= 0 || req.MaxBytes > MaxAllowedBytes {
		return nil, fmt.Errorf("invalid size limit")
	}
	parsed, err := checkURL(req.URL, req.AllowLoopbackHTTP)
	if err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return nil, err
	}
	resp, err := makeClient().Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("download failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 && resp.StatusCode < 400 {
		return nil, fmt.Errorf("the download address redirected elsewhere; refusing to follow")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download failed: HTTP %d", resp.StatusCode)
	}
	if resp.ContentLength > req.MaxBytes {
		return nil, fmt.Errorf("the file is larger than the approved size")
	}

	destDir := filepath.Dir(req.DestPath)
	if err := os.MkdirAll(destDir, 0700); err != nil {
		return nil, err
	}
	tmp, err := os.CreateTemp(destDir, ".download-*")
	if err != nil {
		return nil, err
	}
	tmpName := tmp.Name()
	cleanup := func() {
		tmp.Close()
		os.Remove(tmpName)
	}
	hasher := sha256.New()
	written, err := io.Copy(io.MultiWriter(tmp, hasher), io.LimitReader(resp.Body, req.MaxBytes+1))
	if err != nil {
		cleanup()
		return nil, fmt.Errorf("download failed: %w", err)
	}
	if written > req.MaxBytes {
		cleanup()
		return nil, fmt.Errorf("the file is larger than the approved size")
	}
	sum := hex.EncodeToString(hasher.Sum(nil))
	if !strings.EqualFold(sum, req.SHA256) {
		cleanup()
		return nil, fmt.Errorf("the downloaded file does not match the expected checksum")
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return nil, err
	}
	os.Remove(req.DestPath)
	if err := os.Rename(tmpName, req.DestPath); err != nil {
		os.Remove(tmpName)
		return nil, err
	}
	return &Result{Bytes: written, SHA256: sum}, nil
}

// VerifyFile reports whether an installed file still matches its expected checksum.
func VerifyFile(path string, expectedSHA256 string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()
	hasher := sha256.New()
	if _, err := io.Copy(hasher, f); err != nil {
		return false
	}
	return strings.EqualFold(hex.EncodeToString(hasher.Sum(nil)), expectedSHA256)
}
