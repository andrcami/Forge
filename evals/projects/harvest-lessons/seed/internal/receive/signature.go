package receive

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
)

func validSignature(secret, body []byte, header string) bool {
	mac := hmac.New(sha256.New, secret)
	mac.Write(body)
	want := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(want), []byte(header))
}
