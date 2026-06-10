# StashDash

StashDash ist ein statischer, abhängigkeitsfreier Wollvorrat-Manager für GitHub Pages, alle Daten lokal im Browser via `localStorage` gespeichert, kein Server, kein Build, kein Account nötig

## Features

### Dashboard
- Vier Kennzahlen-Karten: Gesamtgewicht, Gesamtlauflänge, Garn-Sorten, äquivalente 50-g-Knäuel-Anzahl
- Aktivitäts-Feed mit den letzten 5 Bestandsbewegungen

### Stash
- Garn-Einträge anlegen, bearbeiten, löschen (Hersteller, Name, Farbe inkl. Hex-Swatch, Faserzusammensetzung, Nadelstärke, Maschenprobe, Notizen)
- Suche über alle Felder, Sortierung nach mehreren Kriterien mit Auf-/Absteigend-Umschaltung
- Vollständige Bewegungshistorie und Detailansicht pro Garn

### Neues Garn 
- Strukturierte Faser-Eingabe mit mehreren Typen und Prozentangaben
- Automatische Farberkennung aus Foto (Canvas-basierte Dominantfarbe)

### Statistiken (Statistics)
- Gesamtgewicht and Gesamtlauflänge 
- Knäuelbestand–Verlauf: SVG-Liniendiagramm, monatlich aggregiert &  Zeitraum-Wahl (gesamt / 6 Monate / 30 Tage)
- Verteilungs-Balkendiagramme nach Hersteller und Fasertyp

### Import / Export
- JSON-Backup-Export und -Import (ersetzt Daten)
- CSV- und Excel-Import