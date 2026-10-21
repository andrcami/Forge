package deliver

import "time"

// Backoff is the wait before the given attempt.
func Backoff(attempt int) time.Duration {
	return time.Second << attempt
}
