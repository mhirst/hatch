//go:build dev

// dbdump is a one-off tool for inspecting hatch.db while debugging. Build it
// explicitly with `go run -tags dev ./cmd/dbdump`. Without the tag this file
// is excluded from compilation, so release builds never ship it.
package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

func main() {
	dir, _ := os.UserConfigDir()
	path := filepath.Join(dir, "hatch", "hatch.db")
	if len(os.Args) > 1 {
		path = os.Args[1]
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	fmt.Println("── apps schema ──")
	rows, err := db.Query("SELECT sql FROM sqlite_master WHERE name='apps'")
	if err != nil {
		log.Fatal(err)
	}
	for rows.Next() {
		var s string
		rows.Scan(&s)
		fmt.Println(s)
	}
	rows.Close()

	for _, table := range []string{"orgs", "apps", "app_access", "access_log"} {
		fmt.Printf("\n── %s ──\n", table)
		rows, err := db.Query("SELECT * FROM " + table)
		if err != nil {
			fmt.Println(err)
			continue
		}
		cols, _ := rows.Columns()
		fmt.Println(cols)
		for rows.Next() {
			vals := make([]any, len(cols))
			ptrs := make([]any, len(cols))
			for i := range vals {
				ptrs[i] = &vals[i]
			}
			if err := rows.Scan(ptrs...); err != nil {
				fmt.Println(err)
				continue
			}
			fmt.Println(vals)
		}
		rows.Close()
	}
}
