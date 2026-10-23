// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"
	_ "time/tzdata"

	"github.com/Labyricorn/labyrispace/tsunami/app"
	"github.com/Labyricorn/labyrispace/tsunami/vdom"
)

const (
	StyleDigital = "digital"
	StyleAnalog  = "analog"
	StyleFlip    = "flip"
	StyleBinary  = "binary"
	StyleMinimal = "minimal"

	SettingsFileName = "labyrispace-clock.json"
	DateLayout       = "Monday, January 2, 2006"
)

var AppMeta = app.AppMeta{
	Title:     "Clock",
	ShortDesc: "Time and date in several styles and themes, with 12/24 hour format and world clocks",
	Icon:      "clock",
	IconColor: "#38bdf8",
}

type Theme struct {
	Id     string
	Name   string
	Bg     string
	Panel  string
	Fg     string
	Dim    string
	Accent string
	Border string
	Glow   bool
}

var Themes = []Theme{
	{"midnight", "Midnight", "#0f172a", "#1e293b", "#e2e8f0", "#94a3b8", "#38bdf8", "#334155", true},
	{"daylight", "Daylight", "#f8fafc", "#e2e8f0", "#0f172a", "#64748b", "#2563eb", "#cbd5e1", false},
	{"terminal", "Terminal", "#000000", "#06180a", "#33ff66", "#1f9d3f", "#33ff66", "#0e4a1f", true},
	{"amber", "Amber", "#1a1000", "#2a1a00", "#ffb000", "#a66f00", "#ffcc33", "#4d3200", true},
	{"ocean", "Ocean", "#062a33", "#0b3d4a", "#d6f5ff", "#7fb8c8", "#2dd4bf", "#14566a", false},
	{"synthwave", "Synthwave", "#1a0b2e", "#2a1248", "#f8e1ff", "#b18fd1", "#ff3fa4", "#4a2275", true},
}

type StyleChoice struct {
	Id   string
	Name string
}

var StyleChoices = []StyleChoice{
	{StyleDigital, "Digital"},
	{StyleAnalog, "Analog"},
	{StyleFlip, "Flip"},
	{StyleBinary, "Binary"},
	{StyleMinimal, "Minimal"},
}

type ZonePreset struct {
	Label string
	Zone  string
}

var ZonePresets = []ZonePreset{
	{"Honolulu", "Pacific/Honolulu"},
	{"Anchorage", "America/Anchorage"},
	{"Los Angeles", "America/Los_Angeles"},
	{"Denver", "America/Denver"},
	{"Chicago", "America/Chicago"},
	{"New York", "America/New_York"},
	{"Sao Paulo", "America/Sao_Paulo"},
	{"Reykjavik", "Atlantic/Reykjavik"},
	{"London", "Europe/London"},
	{"Paris", "Europe/Paris"},
	{"Berlin", "Europe/Berlin"},
	{"Cairo", "Africa/Cairo"},
	{"Johannesburg", "Africa/Johannesburg"},
	{"Moscow", "Europe/Moscow"},
	{"Dubai", "Asia/Dubai"},
	{"Mumbai", "Asia/Kolkata"},
	{"Bangkok", "Asia/Bangkok"},
	{"Singapore", "Asia/Singapore"},
	{"Shanghai", "Asia/Shanghai"},
	{"Tokyo", "Asia/Tokyo"},
	{"Sydney", "Australia/Sydney"},
	{"Auckland", "Pacific/Auckland"},
	{"UTC", "UTC"},
}

type Settings struct {
	Style       string   `json:"style"`
	Theme       string   `json:"theme"`
	Hour24      bool     `json:"hour24"`
	ShowSeconds bool     `json:"showseconds"`
	ShowDate    bool     `json:"showdate"`
	Zones       []string `json:"zones"`
}

func MakeDefaultSettings() Settings {
	return Settings{
		Style:       StyleDigital,
		Theme:       "midnight",
		Hour24:      false,
		ShowSeconds: true,
		ShowDate:    true,
		Zones:       []string{"America/New_York", "Europe/London", "Asia/Tokyo"},
	}
}

var settingsAtom = app.SharedAtom("settings", LoadSettings())

func settingsPath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		return ""
	}
	return filepath.Join(dir, SettingsFileName)
}

func isKnownStyle(id string) bool {
	for _, c := range StyleChoices {
		if c.Id == id {
			return true
		}
	}
	return false
}

func isKnownTheme(id string) bool {
	for _, t := range Themes {
		if t.Id == id {
			return true
		}
	}
	return false
}

func normalizeSettings(s Settings) Settings {
	if !isKnownStyle(s.Style) {
		s.Style = StyleDigital
	}
	if !isKnownTheme(s.Theme) {
		s.Theme = Themes[0].Id
	}
	seen := map[string]bool{}
	zones := []string{}
	for _, z := range s.Zones {
		if seen[z] {
			continue
		}
		if _, err := time.LoadLocation(z); err != nil {
			continue
		}
		seen[z] = true
		zones = append(zones, z)
	}
	s.Zones = zones
	return s
}

func LoadSettings() Settings {
	s := MakeDefaultSettings()
	path := settingsPath()
	if path == "" {
		return s
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return s
	}
	if err := json.Unmarshal(data, &s); err != nil {
		log.Printf("clock: ignoring unreadable settings file: %v", err)
		return MakeDefaultSettings()
	}
	return normalizeSettings(s)
}

func saveSettings(s Settings) {
	path := settingsPath()
	if path == "" {
		return
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		log.Printf("clock: could not create settings folder: %v", err)
		return
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		log.Printf("clock: could not save settings: %v", err)
	}
}

func updateSettings(fn func(s Settings) Settings) {
	settingsAtom.SetFn(fn)
	saveSettings(settingsAtom.Get())
}

func findTheme(id string) Theme {
	for _, t := range Themes {
		if t.Id == id {
			return t
		}
	}
	return Themes[0]
}

func zoneLabel(zone string) string {
	for _, p := range ZonePresets {
		if p.Zone == zone {
			return p.Label
		}
	}
	parts := strings.Split(zone, "/")
	return strings.ReplaceAll(parts[len(parts)-1], "_", " ")
}

func zoneLocation(zone string) *time.Location {
	loc, err := time.LoadLocation(zone)
	if err != nil {
		return time.UTC
	}
	return loc
}

type TimeParts struct {
	Hour       string
	HourPadded string
	Minute     string
	Second     string
	Suffix     string
}

func MakeTimeParts(t time.Time, hour24 bool) TimeParts {
	if hour24 {
		h := t.Format("15")
		return TimeParts{Hour: h, HourPadded: h, Minute: t.Format("04"), Second: t.Format("05")}
	}
	return TimeParts{
		Hour:       t.Format("3"),
		HourPadded: t.Format("03"),
		Minute:     t.Format("04"),
		Second:     t.Format("05"),
		Suffix:     t.Format("PM"),
	}
}

func (p TimeParts) Text(seconds bool) string {
	text := p.Hour + ":" + p.Minute
	if seconds {
		text += ":" + p.Second
	}
	if p.Suffix != "" {
		text += " " + p.Suffix
	}
	return text
}

func offsetLabel(t time.Time) string {
	_, off := t.Zone()
	sign := "+"
	if off < 0 {
		sign = "-"
		off = -off
	}
	hours := off / 3600
	minutes := (off % 3600) / 60
	if minutes == 0 {
		return fmt.Sprintf("UTC%s%d", sign, hours)
	}
	return fmt.Sprintf("UTC%s%d:%02d", sign, hours, minutes)
}

func dayLabel(t time.Time, local time.Time) string {
	ty, tm, td := t.Date()
	ly, lm, ld := local.Date()
	tDay := time.Date(ty, tm, td, 0, 0, 0, 0, time.UTC)
	lDay := time.Date(ly, lm, ld, 0, 0, 0, 0, time.UTC)
	switch int(tDay.Sub(lDay).Hours() / 24) {
	case 1:
		return "Tomorrow"
	case -1:
		return "Yesterday"
	}
	return "Today"
}

func glowShadow(th Theme) any {
	if !th.Glow {
		return nil
	}
	return "0 0 24px " + th.Accent + "66"
}

func renderDigital(p TimeParts, th Theme, seconds bool) any {
	return vdom.H("div", map[string]any{
		"className": "flex items-baseline justify-center font-mono font-bold leading-none",
		"style": map[string]any{
			"color":      th.Fg,
			"fontSize":   "clamp(2.5rem, 13vw, 9rem)",
			"textShadow": glowShadow(th),
		},
	},
		p.Hour+":"+p.Minute,
		vdom.If(seconds, vdom.H("span", map[string]any{
			"style": map[string]any{"color": th.Accent, "fontSize": "0.55em"},
		}, ":"+p.Second)),
		vdom.If(p.Suffix != "", vdom.H("span", map[string]any{
			"className": "ml-3",
			"style":     map[string]any{"color": th.Dim, "fontSize": "0.3em"},
		}, p.Suffix)),
	)
}

func renderMinimal(p TimeParts, th Theme, seconds bool) any {
	return vdom.H("div", map[string]any{
		"className": "flex items-baseline justify-center font-sans font-extralight leading-none",
		"style": map[string]any{
			"color":    th.Fg,
			"fontSize": "clamp(3rem, 16vw, 11rem)",
		},
	},
		p.Hour+":"+p.Minute,
		vdom.If(seconds, vdom.H("span", map[string]any{
			"className": "ml-2",
			"style":     map[string]any{"color": th.Accent, "fontSize": "0.3em"},
		}, p.Second)),
		vdom.If(p.Suffix != "", vdom.H("span", map[string]any{
			"className": "ml-2",
			"style":     map[string]any{"color": th.Dim, "fontSize": "0.25em"},
		}, p.Suffix)),
	)
}

func renderFlipTile(text string, th Theme) any {
	return vdom.H("div", map[string]any{
		"className": "relative flex items-center justify-center rounded-lg font-mono font-bold leading-none",
		"style": map[string]any{
			"backgroundColor": th.Panel,
			"color":           th.Fg,
			"border":          "1px solid " + th.Border,
			"fontSize":        "clamp(2rem, 9vw, 6rem)",
			"padding":         "0.2em 0.25em",
		},
	},
		text,
		vdom.H("div", map[string]any{
			"className": "absolute inset-x-0 h-px",
			"style":     map[string]any{"top": "50%", "backgroundColor": th.Bg},
		}),
	)
}

func renderFlip(p TimeParts, th Theme, seconds bool) any {
	return vdom.H("div", map[string]any{"className": "flex items-center justify-center gap-3"},
		renderFlipTile(p.HourPadded, th),
		renderFlipTile(p.Minute, th),
		vdom.If(seconds, renderFlipTile(p.Second, th)),
		vdom.If(p.Suffix != "", vdom.H("div", map[string]any{
			"className": "font-mono text-xl",
			"style":     map[string]any{"color": th.Accent},
		}, p.Suffix)),
	)
}

func renderBinaryColumn(digit int, maxBits int, th Theme) any {
	dots := []any{}
	for row := 0; row < 4; row++ {
		bit := 8 >> row
		visible := bit < (1 << maxBits)
		lit := digit&bit != 0
		dots = append(dots, vdom.H("div", map[string]any{
			"key": fmt.Sprintf("bit%d", bit),
			"style": map[string]any{
				"width":           "clamp(0.9rem, 3.5vw, 2rem)",
				"height":          "clamp(0.9rem, 3.5vw, 2rem)",
				"borderRadius":    "50%",
				"backgroundColor": vdom.IfElse(lit, th.Accent, th.Panel),
				"border":          "1px solid " + th.Border,
				"opacity":         vdom.IfElse(visible, 1, 0),
				"boxShadow":       vdom.If(lit && th.Glow, "0 0 12px "+th.Accent),
			},
		}))
	}
	return vdom.H("div", map[string]any{"className": "flex flex-col items-center gap-2"},
		vdom.H("div", map[string]any{"className": "flex flex-col gap-2"}, dots...),
		vdom.H("div", map[string]any{
			"className": "font-mono text-sm",
			"style":     map[string]any{"color": th.Dim},
		}, fmt.Sprintf("%d", digit)),
	)
}

func renderBinary(p TimeParts, th Theme, seconds bool) any {
	groups := []string{p.HourPadded, p.Minute}
	if seconds {
		groups = append(groups, p.Second)
	}
	groupElems := []any{}
	for gi, group := range groups {
		cols := []any{}
		for di, ch := range group {
			maxBits := 4
			if di == 0 && gi == 0 {
				maxBits = 2
			} else if di == 0 {
				maxBits = 3
			}
			cols = append(cols, renderBinaryColumn(int(ch-'0'), maxBits, th))
		}
		groupElems = append(groupElems, vdom.H("div", map[string]any{"className": "flex gap-2"}, cols...))
	}
	return vdom.H("div", map[string]any{"className": "flex flex-col items-center gap-3"},
		vdom.H("div", map[string]any{"className": "flex items-start justify-center gap-6"}, groupElems...),
		vdom.If(p.Suffix != "", vdom.H("div", map[string]any{
			"className": "font-mono text-lg",
			"style":     map[string]any{"color": th.Accent},
		}, p.Suffix)),
	)
}

func polar(angleDeg float64, radius float64) (float64, float64) {
	rad := angleDeg * math.Pi / 180
	return 100 + radius*math.Sin(rad), 100 - radius*math.Cos(rad)
}

func renderHand(angleDeg float64, length float64, tail float64, width float64, color string) any {
	x1, y1 := polar(angleDeg+180, tail)
	x2, y2 := polar(angleDeg, length)
	return vdom.H("line", map[string]any{
		"x1": x1, "y1": y1, "x2": x2, "y2": y2,
		"stroke":        color,
		"strokeWidth":   width,
		"strokeLinecap": "round",
	})
}

func renderAnalog(t time.Time, p TimeParts, th Theme, seconds bool, hour24 bool) any {
	children := []any{
		vdom.H("circle", map[string]any{
			"cx": 100, "cy": 100, "r": 96,
			"fill":        th.Panel,
			"stroke":      th.Border,
			"strokeWidth": 3,
		}),
	}
	for i := 0; i < 60; i++ {
		major := i%5 == 0
		inner := 90.0
		width := 1.0
		color := th.Dim
		if major {
			inner = 84
			width = 2.5
			color = th.Fg
		}
		x1, y1 := polar(float64(i)*6, inner)
		x2, y2 := polar(float64(i)*6, 94)
		children = append(children, vdom.H("line", map[string]any{
			"key": fmt.Sprintf("tick%d", i),
			"x1":  x1, "y1": y1, "x2": x2, "y2": y2,
			"stroke":      color,
			"strokeWidth": width,
		}))
	}
	for n := 1; n <= 12; n++ {
		x, y := polar(float64(n)*30, 70)
		children = append(children, vdom.H("text", map[string]any{
			"key": fmt.Sprintf("num%d", n),
			"x":   x, "y": y,
			"textAnchor":       "middle",
			"dominantBaseline": "central",
			"fontSize":         14,
			"fontWeight":       "bold",
			"fill":             th.Fg,
		}, fmt.Sprintf("%d", n)))
		if !hour24 {
			continue
		}
		ix, iy := polar(float64(n)*30, 54)
		children = append(children, vdom.H("text", map[string]any{
			"key": fmt.Sprintf("num24-%d", n),
			"x":   ix, "y": iy,
			"textAnchor":       "middle",
			"dominantBaseline": "central",
			"fontSize":         8,
			"fill":             th.Dim,
		}, fmt.Sprintf("%d", 12+n)))
	}
	sec := float64(t.Second())
	minutes := float64(t.Minute()) + sec/60
	hour := float64(t.Hour()%12) + minutes/60
	children = append(children,
		renderHand(hour*30, 45, 8, 5, th.Fg),
		renderHand(minutes*6, 70, 10, 3.5, th.Fg),
	)
	if seconds {
		children = append(children, renderHand(sec*6, 80, 16, 1.5, th.Accent))
	}
	children = append(children, vdom.H("circle", map[string]any{
		"cx": 100, "cy": 100, "r": 4.5, "fill": th.Accent,
	}))
	return vdom.H("div", map[string]any{"className": "flex flex-col items-center gap-3"},
		vdom.H("svg", map[string]any{
			"viewBox": "0 0 200 200",
			"style":   map[string]any{"width": "min(70vw, 50vh)", "height": "min(70vw, 50vh)"},
		}, children...),
		vdom.H("div", map[string]any{
			"className": "font-mono text-lg",
			"style":     map[string]any{"color": th.Dim},
		}, p.Text(seconds)),
	)
}

func renderClockFace(s Settings, th Theme, local time.Time) any {
	p := MakeTimeParts(local, s.Hour24)
	switch s.Style {
	case StyleAnalog:
		return renderAnalog(local, p, th, s.ShowSeconds, s.Hour24)
	case StyleFlip:
		return renderFlip(p, th, s.ShowSeconds)
	case StyleBinary:
		return renderBinary(p, th, s.ShowSeconds)
	case StyleMinimal:
		return renderMinimal(p, th, s.ShowSeconds)
	}
	return renderDigital(p, th, s.ShowSeconds)
}

func renderDateLine(s Settings, th Theme, local time.Time) any {
	zoneName, _ := local.Zone()
	return vdom.H("div", map[string]any{"className": "flex flex-col items-center gap-1"},
		vdom.If(s.ShowDate, vdom.H("div", map[string]any{
			"className": "text-xl",
			"style":     map[string]any{"color": th.Fg},
		}, local.Format(DateLayout))),
		vdom.H("div", map[string]any{
			"className": "text-sm",
			"style":     map[string]any{"color": th.Dim},
		}, fmt.Sprintf("Local time - %s - %s", zoneName, offsetLabel(local))),
	)
}

func renderWorldClock(zone string, local time.Time, s Settings, th Theme, onRemove func()) any {
	t := local.In(zoneLocation(zone))
	p := MakeTimeParts(t, s.Hour24)
	isDay := t.Hour() >= 6 && t.Hour() < 18
	return vdom.H("div", map[string]any{
		"key":       zone,
		"className": "flex items-center justify-between gap-3 rounded-lg px-4 py-3",
		"style": map[string]any{
			"backgroundColor": th.Panel,
			"border":          "1px solid " + th.Border,
		},
	},
		vdom.H("div", map[string]any{"className": "flex items-center gap-3 min-w-0"},
			vdom.H("div", map[string]any{
				"className": "rounded-full shrink-0",
				"title":     vdom.IfElse(isDay, "Daytime", "Night"),
				"style": map[string]any{
					"width":           "0.75rem",
					"height":          "0.75rem",
					"backgroundColor": vdom.IfElse(isDay, th.Accent, "transparent"),
					"border":          "2px solid " + th.Accent,
				},
			}),
			vdom.H("div", map[string]any{"className": "min-w-0"},
				vdom.H("div", map[string]any{
					"className": "font-semibold truncate",
					"style":     map[string]any{"color": th.Fg},
				}, zoneLabel(zone)),
				vdom.H("div", map[string]any{
					"className": "text-xs",
					"style":     map[string]any{"color": th.Dim},
				}, dayLabel(t, local)+" - "+offsetLabel(t)),
			),
		),
		vdom.H("div", map[string]any{"className": "flex items-center gap-3"},
			vdom.H("div", map[string]any{
				"className": "font-mono text-2xl font-bold",
				"style":     map[string]any{"color": th.Fg},
			}, p.Text(s.ShowSeconds)),
			vdom.H("button", map[string]any{
				"className": "cursor-pointer px-1 text-lg leading-none",
				"title":     "Remove",
				"style":     map[string]any{"color": th.Dim},
				"onClick":   onRemove,
			}, "x"),
		),
	)
}

func renderChoice(key string, label string, active bool, th Theme, onClick func()) any {
	return vdom.H("button", map[string]any{
		"key":       key,
		"className": "cursor-pointer rounded px-3 py-1 text-sm transition-opacity hover:opacity-80",
		"style": map[string]any{
			"backgroundColor": vdom.IfElse(active, th.Accent, th.Panel),
			"color":           vdom.IfElse(active, th.Bg, th.Fg),
			"border":          "1px solid " + th.Border,
		},
		"onClick": onClick,
	}, label)
}

func renderSettingRow(label string, th Theme, controls ...any) any {
	return vdom.H("div", map[string]any{"className": "flex flex-wrap items-center gap-2"},
		vdom.H("div", map[string]any{
			"className": "w-20 text-sm shrink-0",
			"style":     map[string]any{"color": th.Dim},
		}, label),
		vdom.H("div", map[string]any{"className": "flex flex-wrap items-center gap-2"}, controls...),
	)
}

func fieldStyle(th Theme) map[string]any {
	return map[string]any{
		"backgroundColor": th.Panel,
		"color":           th.Fg,
		"border":          "1px solid " + th.Border,
	}
}

var App = app.DefineComponent("App",
	func(_ struct{}) any {
		nowUnix := app.UseLocal(time.Now().Unix())
		showSettings := app.UseLocal(false)
		zoneChoice := app.UseLocal("")
		customZone := app.UseLocal("")
		zoneError := app.UseLocal("")

		app.UseTicker(250*time.Millisecond, func() {
			n := time.Now().Unix()
			if n != nowUnix.Get() {
				nowUnix.Set(n)
			}
		}, []any{})

		s := settingsAtom.Get()
		th := findTheme(s.Theme)
		local := time.Unix(nowUnix.Get(), 0).Local()

		setStyle := func(id string) {
			updateSettings(func(s Settings) Settings {
				s.Style = id
				return s
			})
		}
		setTheme := func(id string) {
			updateSettings(func(s Settings) Settings {
				s.Theme = id
				return s
			})
		}
		setHour24 := func(v bool) {
			updateSettings(func(s Settings) Settings {
				s.Hour24 = v
				return s
			})
		}
		toggleSeconds := func() {
			updateSettings(func(s Settings) Settings {
				s.ShowSeconds = !s.ShowSeconds
				return s
			})
		}
		toggleDate := func() {
			updateSettings(func(s Settings) Settings {
				s.ShowDate = !s.ShowDate
				return s
			})
		}
		addZone := func(zone string) {
			updateSettings(func(s Settings) Settings {
				for _, z := range s.Zones {
					if z == zone {
						return s
					}
				}
				s.Zones = append(s.Zones, zone)
				return s
			})
		}
		removeZone := func(zone string) {
			updateSettings(func(s Settings) Settings {
				kept := []string{}
				for _, z := range s.Zones {
					if z != zone {
						kept = append(kept, z)
					}
				}
				s.Zones = kept
				return s
			})
		}
		addCustomZone := func() {
			name := strings.TrimSpace(customZone.Get())
			if name == "" {
				return
			}
			if _, err := time.LoadLocation(name); err != nil {
				zoneError.Set(fmt.Sprintf("Unknown time zone %q. Use names like Europe/Madrid.", name))
				return
			}
			zoneError.Set("")
			customZone.Set("")
			addZone(name)
		}

		added := map[string]bool{}
		for _, z := range s.Zones {
			added[z] = true
		}
		available := []ZonePreset{}
		for _, p := range ZonePresets {
			if !added[p.Zone] {
				available = append(available, p)
			}
		}
		selectedZone := zoneChoice.Get()
		if selectedZone == "" || added[selectedZone] {
			selectedZone = ""
			if len(available) > 0 {
				selectedZone = available[0].Zone
			}
		}

		styleButtons := []any{}
		for _, c := range StyleChoices {
			id := c.Id
			styleButtons = append(styleButtons, renderChoice(id, c.Name, s.Style == id, th, func() { setStyle(id) }))
		}
		themeButtons := []any{}
		for _, t := range Themes {
			id := t.Id
			themeButtons = append(themeButtons, renderChoice(id, t.Name, s.Theme == id, th, func() { setTheme(id) }))
		}
		zoneOptions := []any{}
		for _, p := range available {
			zoneOptions = append(zoneOptions, vdom.H("option", map[string]any{
				"key":   p.Zone,
				"value": p.Zone,
			}, p.Label))
		}

		worldClocks := []any{}
		for _, zone := range s.Zones {
			z := zone
			worldClocks = append(worldClocks, renderWorldClock(z, local, s, th, func() { removeZone(z) }))
		}

		settingsPanel := vdom.If(showSettings.Get(),
			vdom.H("div", map[string]any{
				"className": "flex flex-col gap-3 rounded-lg p-4",
				"style": map[string]any{
					"backgroundColor": th.Panel,
					"border":          "1px solid " + th.Border,
				},
			},
				renderSettingRow("Style", th, styleButtons...),
				renderSettingRow("Theme", th, themeButtons...),
				renderSettingRow("Format", th,
					renderChoice("12h", "12-hour", !s.Hour24, th, func() { setHour24(false) }),
					renderChoice("24h", "24-hour", s.Hour24, th, func() { setHour24(true) }),
				),
				renderSettingRow("Show", th,
					renderChoice("seconds", "Seconds", s.ShowSeconds, th, toggleSeconds),
					renderChoice("date", "Date", s.ShowDate, th, toggleDate),
				),
				renderSettingRow("World clock", th,
					vdom.If(len(available) > 0, vdom.H("select", map[string]any{
						"className": "rounded px-2 py-1 text-sm",
						"style":     fieldStyle(th),
						"value":     selectedZone,
						"onChange": func(e vdom.VDomEvent) {
							zoneChoice.Set(e.TargetValue)
						},
					}, zoneOptions...)),
					vdom.If(len(available) > 0, renderChoice("addzone", "Add", false, th, func() {
						if selectedZone != "" {
							addZone(selectedZone)
						}
					})),
				),
				renderSettingRow("Custom zone", th,
					vdom.H("input", map[string]any{
						"className":   "rounded px-2 py-1 text-sm",
						"style":       fieldStyle(th),
						"type":        "text",
						"placeholder": "Europe/Madrid",
						"value":       customZone.Get(),
						"onChange": func(e vdom.VDomEvent) {
							customZone.Set(e.TargetValue)
						},
						"onKeyDown": &vdom.VDomFunc{
							Type:           "func",
							Fn:             func(event vdom.VDomEvent) { addCustomZone() },
							Keys:           []string{"Enter"},
							PreventDefault: true,
						},
					}),
					renderChoice("addcustom", "Add", false, th, addCustomZone),
				),
				vdom.If(zoneError.Get() != "", vdom.H("div", map[string]any{
					"className": "text-sm",
					"style":     map[string]any{"color": th.Accent},
				}, zoneError.Get())),
			),
		)

		return vdom.H("div", map[string]any{
			"className": "flex flex-col gap-6 w-full h-screen overflow-y-auto p-5 font-sans",
			"style":     map[string]any{"backgroundColor": th.Bg, "color": th.Fg},
		},
			vdom.H("div", map[string]any{"className": "flex items-center justify-between"},
				vdom.H("div", map[string]any{
					"className": "text-sm uppercase tracking-widest",
					"style":     map[string]any{"color": th.Dim},
				}, "Clock"),
				vdom.H("button", map[string]any{
					"className": "cursor-pointer rounded px-3 py-1 text-sm hover:opacity-80",
					"style": map[string]any{
						"backgroundColor": vdom.IfElse(showSettings.Get(), th.Accent, th.Panel),
						"color":           vdom.IfElse(showSettings.Get(), th.Bg, th.Fg),
						"border":          "1px solid " + th.Border,
					},
					"onClick": func() { showSettings.Set(!showSettings.Get()) },
				}, "Settings"),
			),
			settingsPanel,
			vdom.H("div", map[string]any{"className": "flex flex-col items-center justify-center gap-5 py-4"},
				renderClockFace(s, th, local),
				renderDateLine(s, th, local),
			),
			vdom.If(len(worldClocks) > 0, vdom.H("div", map[string]any{
				"className": "grid gap-3",
				"style":     map[string]any{"gridTemplateColumns": "repeat(auto-fill, minmax(18rem, 1fr))"},
			}, worldClocks...)),
		)
	},
)
