package main

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	// Set root directory to current directory by default, or take from argument
	root := "."
	if len(os.Args) > 1 {
		root = os.Args[1]
	}

	var jsFiles []string
	var tsFiles []string

	// Step 1: Walk the directory and collect .js and .ts files
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		// Skip common directories that shouldn't be touched
		if d.IsDir() {
			name := d.Name()
			if name == ".git" || name == "node_modules" || name == "dist" || name == "build" {
				return filepath.SkipDir
			}
			return nil
		}

		ext := filepath.Ext(path)
		if ext == ".js" {
			jsFiles = append(jsFiles, path)
		} else if ext == ".ts" {
			tsFiles = append(tsFiles, path)
		}

		return nil
	})

	if err != nil {
		fmt.Printf("Error walking directory: %v\n", err)
		os.Exit(1)
	}

	// Step 2: Determine direction based on your rule:
	// "if all files have ts extn, it should rename all to js"
	var fromExt, toExt string
	var filesToRename []string

	if len(tsFiles) > 0 && len(jsFiles) == 0 {
		fmt.Println("All detected files are .ts. Converting all .ts -> .js...")
		fromExt = ".ts"
		toExt = ".js"
		filesToRename = tsFiles
	} else {
		fmt.Println("Converting all .js -> .ts...")
		fromExt = ".js"
		toExt = ".ts"
		filesToRename = jsFiles
	}

	if len(filesToRename) == 0 {
		fmt.Println("No matching files found to rename.")
		return
	}

	// Step 3: Perform the rename
	successCount := 0
	for _, oldPath := range filesToRename {
		dir := filepath.Dir(oldPath)
		base := filepath.Base(oldPath)
		name := strings.TrimSuffix(base, fromExt)
		newPath := filepath.Join(dir, name+toExt)

		err := os.Rename(oldPath, newPath)
		if err != nil {
			fmt.Printf("Failed to rename %s -> %s: %v\n", oldPath, newPath, err)
		} else {
			fmt.Printf("Renamed: %s -> %s\n", oldPath, newPath)
			successCount++
		}
	}

	fmt.Printf("\nSuccessfully renamed %d file(s).\n", successCount)
}
