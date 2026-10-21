package deliver

import "time"

// Backoff is the wait before the given attempt. Attempts are 1-based: the
// deliveries.attempt column starts at 1.
func Backoff(attempt int) time.Duration {
	return time.Second << (attempt - 1)
}
