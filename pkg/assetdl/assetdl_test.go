// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package assetdl

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func sumOf(data string) string {
	h := sha256.Sum256([]byte(data))
	return hex.EncodeToString(h[:])
}

func newServer(t *testing.T, body string) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/file", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(body)) })
	mux.HandleFunc("/moved", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/file", http.StatusFound)
	})
	mux.HandleFunc("/missing", func(w http.ResponseWriter, r *http.Request) { http.NotFound(w, r) })
	return httptest.NewServer(mux)
}

func req(srv *httptest.Server, path string, body string, dest string) Request {
	return Request{URL: srv.URL + path, SHA256: sumOf(body), MaxBytes: 1 << 20, DestPath: dest, AllowLoopbackHTTP: true}
}

func TestDownloadSucceedsAndVerifies(t *testing.T) {
	srv := newServer(t, "hello database")
	defer srv.Close()
	dest := filepath.Join(t.TempDir(), "widgets-data", "w", "downloads", "db")
	res, err := Download(context.Background(), req(srv, "/file", "hello database", dest))
	if err != nil {
		t.Fatal(err)
	}
	if res.Bytes != int64(len("hello database")) {
		t.Errorf("unexpected byte count %d", res.Bytes)
	}
	data, err := os.ReadFile(dest)
	if err != nil || string(data) != "hello database" {
		t.Fatalf("file not in place: %v %q", err, data)
	}
	if !VerifyFile(dest, sumOf("hello database")) {
		t.Error("VerifyFile should accept the installed file")
	}
	if VerifyFile(dest, sumOf("other")) {
		t.Error("VerifyFile must reject a different checksum")
	}
}

func TestDownloadRejectsChecksumMismatchAndLeavesNothing(t *testing.T) {
	srv := newServer(t, "tampered")
	defer srv.Close()
	dir := t.TempDir()
	dest := filepath.Join(dir, "downloads", "db")
	r := req(srv, "/file", "tampered", dest)
	r.SHA256 = sumOf("expected")
	if _, err := Download(context.Background(), r); err == nil || !strings.Contains(err.Error(), "checksum") {
		t.Fatalf("expected checksum error, got %v", err)
	}
	if _, err := os.Stat(dest); err == nil {
		t.Error("a mismatching file must not be kept")
	}
	entries, _ := os.ReadDir(filepath.Join(dir, "downloads"))
	if len(entries) != 0 {
		t.Errorf("temporary files left behind: %v", entries)
	}
}

func TestDownloadRefusesRedirects(t *testing.T) {
	srv := newServer(t, "data")
	defer srv.Close()
	dest := filepath.Join(t.TempDir(), "db")
	if _, err := Download(context.Background(), req(srv, "/moved", "data", dest)); err == nil || !strings.Contains(err.Error(), "redirect") {
		t.Fatalf("expected redirect refusal, got %v", err)
	}
	if _, err := os.Stat(dest); err == nil {
		t.Error("nothing should be written after a redirect")
	}
}

func TestDownloadEnforcesSizeLimit(t *testing.T) {
	srv := newServer(t, "0123456789")
	defer srv.Close()
	dest := filepath.Join(t.TempDir(), "db")
	r := req(srv, "/file", "0123456789", dest)
	r.MaxBytes = 5
	if _, err := Download(context.Background(), r); err == nil || !strings.Contains(err.Error(), "larger") {
		t.Fatalf("expected size error, got %v", err)
	}
}

func TestDownloadRejectsBadStatusAndAddresses(t *testing.T) {
	srv := newServer(t, "data")
	defer srv.Close()
	dest := filepath.Join(t.TempDir(), "db")
	if _, err := Download(context.Background(), req(srv, "/missing", "data", dest)); err == nil {
		t.Error("a 404 must fail")
	}
	cases := []Request{
		{URL: "http://example.com/file", SHA256: sumOf("x"), MaxBytes: 10, DestPath: dest, AllowLoopbackHTTP: true},
		{URL: "http://127.0.0.1:1/file", SHA256: sumOf("x"), MaxBytes: 10, DestPath: dest, AllowLoopbackHTTP: false},
		{URL: "ftp://example.com/file", SHA256: sumOf("x"), MaxBytes: 10, DestPath: dest},
		{URL: "https://user:pw@example.com/file", SHA256: sumOf("x"), MaxBytes: 10, DestPath: dest},
		{URL: "https://example.com/file", SHA256: "short", MaxBytes: 10, DestPath: dest},
		{URL: "https://example.com/file", SHA256: sumOf("x"), MaxBytes: 0, DestPath: dest},
	}
	for i, c := range cases {
		if _, err := Download(context.Background(), c); err == nil {
			t.Errorf("case %d should have been refused", i)
		}
	}
}

func TestDownloadRefusesWaveServiceHosts(t *testing.T) {
	dest := filepath.Join(t.TempDir(), "db")
	_, err := Download(context.Background(), Request{URL: "https://docs.waveterm.dev/file", SHA256: sumOf("x"), MaxBytes: 10, DestPath: dest})
	if err == nil {
		t.Fatal("vendor hosts must stay blocked")
	}
}

func TestDestPathForKeepsFilesUnderTheWidgetFolder(t *testing.T) {
	root := t.TempDir()
	got, err := DestPathFor(root, "network-globe", "geo-country")
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(root, "widgets-data", "network-globe", "downloads", "geo-country")
	if got != want {
		t.Errorf("got %q want %q", got, want)
	}
	for _, bad := range [][2]string{{"../x", "a"}, {"w", "../a"}, {"w", "a/b"}, {"W", "a"}, {"w", ""}, {"w", ".."}} {
		if _, err := DestPathFor(root, bad[0], bad[1]); err == nil {
			t.Errorf("expected rejection of %v", bad)
		}
	}
}
