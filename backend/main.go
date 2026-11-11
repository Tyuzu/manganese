package main

import (
	"nae/internal/app"
	"nae/internal/config"
)

func main() {
	if err := app.Start(config.Default()); err != nil {
		panic(err)
	}
}
