package deliver

import (
	"net/http"
	"time"
)

var client = &http.Client{Timeout: 10 * time.Second}
