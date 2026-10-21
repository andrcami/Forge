package receive

import (
	"encoding/json"
	"io"
	"net/http"

	"example.com/relay/internal/store"
)

const maxBody = 1 << 20

type Handler struct {
	Secret []byte
	Store  *store.Store
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Verify over the exact bytes the sender signed: re-encoding changes them.
	body, err := io.ReadAll(io.LimitReader(r.Body, maxBody))
	if err != nil {
		http.Error(w, "read failed", http.StatusBadRequest)
		return
	}
	if !validSignature(h.Secret, body, r.Header.Get("X-Signature")) {
		http.Error(w, "bad signature", http.StatusUnauthorized)
		return
	}
	if !json.Valid(body) {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	if err := h.Store.SaveEvent(r.Context(), body); err != nil {
		http.Error(w, "store failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusAccepted)
}
