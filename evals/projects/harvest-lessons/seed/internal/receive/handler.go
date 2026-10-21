package receive

import (
	"encoding/json"
	"net/http"

	"example.com/relay/internal/store"
)

type Handler struct {
	Secret []byte
	Store  *store.Store
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var event map[string]any
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	body, _ := json.Marshal(event)
	if !validSignature(h.Secret, body, r.Header.Get("X-Signature")) {
		http.Error(w, "bad signature", http.StatusUnauthorized)
		return
	}
	if err := h.Store.SaveEvent(r.Context(), body); err != nil {
		http.Error(w, "store failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusAccepted)
}
