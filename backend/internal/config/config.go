package config

// Config contains the runtime server settings for the application.
type Config struct {
	Host  string
	Port  string
	Token string
}

// Default returns the default app configuration.
func Default() Config {
	return Config{
		Host:  "localhost",
		Port:  "4000",
		Token: "valid-jwt-token-xyz",
	}
}
