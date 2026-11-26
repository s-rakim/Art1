package main

import (
	"math"
	"sort"
	"strings"
	"time"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

// Product is what the index knows about one listing. Only active products
// from active stores are ever loaded.
type Product struct {
	ID            string
	Slug          string
	Title         string
	Brand         string
	Description   string
	Tags          []string
	Category      string   // own category slug
	CategoryIDs   []string // own category and every ancestor, for "dresses" inside "women"
	CategoryNames []string
	Store         string // store slug
	StoreName     string
	PriceCents    int64
	Rating        float64
	Sold          int64
	CreatedAt     time.Time
}

type posting struct {
	doc int32
	tf  float32 // field weighted term frequency
}

// Index is immutable once built. Updates build a new one and swap it in.
type Index struct {
	docs     []Product
	postings map[string][]posting
	docLen   []float32
	avgLen   float32
	byFirst  map[rune][]string // vocabulary bucketed by first letter, for typo matching
	vocab    []string          // sorted, for prefix matching
	builtAt  time.Time
}

var fieldWeights = struct{ title, brand, tags, category, store, description float32 }{3, 2, 2, 1.5, 1, 1}

var stopwords = map[string]bool{
	"a": true, "an": true, "and": true, "the": true, "for": true, "of": true, "in": true, "on": true,
	"with": true, "to": true, "by": true, "at": true, "or": true, "is": true,
}

// tokenize lowercases, strips accents and splits on anything that isn't a
// letter or digit.
func tokenize(s string) []string {
	s = norm.NFKD.String(strings.ToLower(s))
	var out []string
	var b strings.Builder
	flush := func() {
		if b.Len() > 0 {
			t := b.String()
			if !stopwords[t] && len(t) <= 40 {
				out = append(out, t)
			}
			b.Reset()
		}
	}
	for _, r := range s {
		switch {
		case unicode.Is(unicode.Mn, r):
			// combining accent from NFKD: drop it
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			b.WriteRune(r)
		default:
			flush()
		}
	}
	flush()
	return out
}

// stem is a deliberately small English plural folder: "dresses" -> "dress",
// "shoes" -> "shoe". Good enough for product titles, cheap, predictable.
func stem(t string) string {
	switch {
	case len(t) > 4 && strings.HasSuffix(t, "ies"):
		return t[:len(t)-3] + "y"
	case len(t) > 4 && (strings.HasSuffix(t, "sses") || strings.HasSuffix(t, "shes") || strings.HasSuffix(t, "ches") || strings.HasSuffix(t, "xes")):
		return t[:len(t)-2]
	case len(t) > 3 && strings.HasSuffix(t, "s") && !strings.HasSuffix(t, "ss") && !strings.HasSuffix(t, "us"):
		return t[:len(t)-1]
	}
	return t
}

func terms(s string) []string {
	toks := tokenize(s)
	for i, t := range toks {
		toks[i] = stem(t)
	}
	return toks
}

func Build(products []Product) *Index {
	idx := &Index{
		docs:     products,
		postings: make(map[string][]posting, len(products)*8),
		docLen:   make([]float32, len(products)),
		byFirst:  map[rune][]string{},
		builtAt:  time.Now(),
	}
	var total float32
	for i, p := range products {
		tf := map[string]float32{}
		add := func(text string, w float32) {
			for _, t := range terms(text) {
				tf[t] += w
			}
		}
		add(p.Title, fieldWeights.title)
		add(p.Brand, fieldWeights.brand)
		for _, t := range p.Tags {
			add(t, fieldWeights.tags)
		}
		for _, c := range p.CategoryNames {
			add(c, fieldWeights.category)
		}
		add(p.StoreName, fieldWeights.store)
		desc := p.Description
		if len(desc) > 2000 {
			desc = desc[:2000]
		}
		add(desc, fieldWeights.description)

		var l float32
		for t, w := range tf {
			idx.postings[t] = append(idx.postings[t], posting{doc: int32(i), tf: w})
			l += w
		}
		idx.docLen[i] = l
		total += l
	}
	if len(products) > 0 {
		idx.avgLen = total / float32(len(products))
	}
	for t := range idx.postings {
		idx.vocab = append(idx.vocab, t)
		r := []rune(t)[0]
		idx.byFirst[r] = append(idx.byFirst[r], t)
	}
	sort.Strings(idx.vocab)
	return idx
}

// Query is one search request after validation.
type Query struct {
	Text       string
	Category   string // slug, matches the category or anything below it
	CategoryID string // resolved by the caller from the slug
	Store      string
	Brand      string
	MinPrice   *int64
	MaxPrice   *int64
	Sort       string
	Page       int
	PageSize   int
}

type Facet struct {
	Value string `json:"value"`
	Label string `json:"label"`
	Count int    `json:"count"`
}

type Result struct {
	IDs       []string           `json:"ids"`
	Total     int                `json:"total"`
	Facets    map[string][]Facet `json:"facets"`
	Corrected string             `json:"corrected,omitempty"`
}

// expand returns the index terms a query term should match, each with a
// weight: exact 1.0, typo 0.6, prefix (last word only, while typing) 0.7.
func (idx *Index) expand(t string, last bool) map[string]float32 {
	out := map[string]float32{}
	if _, ok := idx.postings[t]; ok {
		out[t] = 1
	}
	if last && len(t) >= 2 {
		i := sort.SearchStrings(idx.vocab, t)
		for n := 0; i < len(idx.vocab) && n < 50 && strings.HasPrefix(idx.vocab[i], t); i, n = i+1, n+1 {
			if idx.vocab[i] != t {
				out[idx.vocab[i]] = 0.7
			}
		}
	}
	if len(out) == 0 && len([]rune(t)) >= 4 {
		r := []rune(t)[0]
		for _, cand := range idx.byFirst[r] {
			if abs(len(cand)-len(t)) <= 1 && editDistanceAtMostOne(cand, t) {
				out[cand] = 0.6
			}
		}
	}
	return out
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

// editDistanceAtMostOne: one insert, delete or substitution apart. Also
// accepts one transposition ("shrit" for "shirt").
func editDistanceAtMostOne(a, b string) bool {
	ra, rb := []rune(a), []rune(b)
	if len(ra) == len(rb) {
		diff := -1
		for i := range ra {
			if ra[i] != rb[i] {
				if diff >= 0 {
					// allow a single adjacent swap
					return diff == i-1 && ra[diff] == rb[i] && ra[i] == rb[diff] && string(ra[i+1:]) == string(rb[i+1:])
				}
				diff = i
			}
		}
		return true
	}
	if len(ra) < len(rb) {
		ra, rb = rb, ra
	}
	if len(ra)-len(rb) != 1 {
		return false
	}
	i, j, skipped := 0, 0, false
	for i < len(ra) && j < len(rb) {
		if ra[i] == rb[j] {
			i++
			j++
			continue
		}
		if skipped {
			return false
		}
		skipped = true
		i++
	}
	return true
}

const k1, b = 1.2, 0.75

func (idx *Index) Search(q Query) Result {
	qterms := terms(q.Text)
	if len(qterms) > 12 {
		qterms = qterms[:12]
	}

	n := float64(len(idx.docs))
	scores := map[int32]float64{}
	matchedGroups := map[int32]int{}
	var corrected []string
	usedTypo := false

	for gi, t := range qterms {
		exp := idx.expand(t, gi == len(qterms)-1)
		best, bestW := t, float32(0)
		seen := map[int32]bool{}
		for term, w := range exp {
			if w > bestW {
				best, bestW = term, w
			}
			if w == 0.6 {
				usedTypo = true
			}
			plist := idx.postings[term]
			idf := math.Log(1 + (n-float64(len(plist))+0.5)/(float64(len(plist))+0.5))
			for _, p := range plist {
				dl := float64(idx.docLen[p.doc])
				tf := float64(p.tf)
				s := idf * (tf * (k1 + 1)) / (tf + k1*(1-b+b*dl/float64(idx.avgLen)))
				scores[p.doc] += s * float64(w)
				if !seen[p.doc] {
					seen[p.doc] = true
					matchedGroups[p.doc]++
				}
			}
		}
		corrected = append(corrected, best)
	}

	// Every word must match something; if that finds nothing, fall back to
	// any word matching so a long query still returns results.
	var hits []int32
	need := len(qterms)
	for d, g := range matchedGroups {
		if g == need {
			hits = append(hits, d)
		}
	}
	if len(hits) == 0 {
		for d := range matchedGroups {
			hits = append(hits, d)
		}
	}
	if len(qterms) == 0 {
		for i := range idx.docs {
			hits = append(hits, int32(i))
		}
	}

	// Filters.
	filtered := hits[:0]
	for _, d := range hits {
		p := &idx.docs[d]
		if q.Store != "" && p.Store != q.Store {
			continue
		}
		if q.Brand != "" && !strings.EqualFold(p.Brand, q.Brand) {
			continue
		}
		if q.CategoryID != "" && !contains(p.CategoryIDs, q.CategoryID) {
			continue
		}
		if q.MinPrice != nil && p.PriceCents < *q.MinPrice {
			continue
		}
		if q.MaxPrice != nil && p.PriceCents > *q.MaxPrice {
			continue
		}
		filtered = append(filtered, d)
	}

	// Facets on the filtered set.
	cats, brands := map[string]int{}, map[string]int{}
	brandLabel := map[string]string{}
	for _, d := range filtered {
		p := &idx.docs[d]
		if p.Category != "" {
			cats[p.Category]++
		}
		if p.Brand != "" {
			k := strings.ToLower(p.Brand)
			brands[k]++
			brandLabel[k] = p.Brand
		}
	}

	// Popularity nudges relevance so equally matching products come out
	// best seller first.
	pop := func(d int32) float64 {
		p := &idx.docs[d]
		return math.Log1p(float64(p.Sold))*0.15 + p.Rating*0.05
	}
	sort.SliceStable(filtered, func(i, j int) bool {
		a, c := &idx.docs[filtered[i]], &idx.docs[filtered[j]]
		switch q.Sort {
		case "price_asc":
			if a.PriceCents != c.PriceCents {
				return a.PriceCents < c.PriceCents
			}
		case "price_desc":
			if a.PriceCents != c.PriceCents {
				return a.PriceCents > c.PriceCents
			}
		case "newest":
			if !a.CreatedAt.Equal(c.CreatedAt) {
				return a.CreatedAt.After(c.CreatedAt)
			}
		case "rating":
			if a.Rating != c.Rating {
				return a.Rating > c.Rating
			}
		case "popular":
			if a.Sold != c.Sold {
				return a.Sold > c.Sold
			}
		}
		si, sj := scores[filtered[i]]+pop(filtered[i]), scores[filtered[j]]+pop(filtered[j])
		if si != sj {
			return si > sj
		}
		return a.ID < c.ID
	})

	res := Result{Total: len(filtered), IDs: []string{}, Facets: map[string][]Facet{
		"category": topFacets(cats, nil, 20),
		"brand":    topFacets(brands, brandLabel, 20),
	}}
	start := (q.Page - 1) * q.PageSize
	for i := start; i < len(filtered) && i < start+q.PageSize; i++ {
		res.IDs = append(res.IDs, idx.docs[filtered[i]].ID)
	}
	if usedTypo {
		res.Corrected = strings.Join(corrected, " ")
	}
	return res
}

func topFacets(counts map[string]int, labels map[string]string, limit int) []Facet {
	out := make([]Facet, 0, len(counts))
	for v, c := range counts {
		label := v
		if labels != nil {
			label = labels[v]
		}
		out = append(out, Facet{Value: v, Label: label, Count: c})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count != out[j].Count {
			return out[i].Count > out[j].Count
		}
		return out[i].Value < out[j].Value
	})
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

type Suggestion struct {
	Text string `json:"text"`
	Slug string `json:"slug,omitempty"`
	Kind string `json:"kind"`
}

// Suggest powers search-as-you-type: matching categories and stores first,
// then the best selling products whose words start with what was typed.
func (idx *Index) Suggest(text string, limit int) []Suggestion {
	qterms := tokenize(text)
	out := []Suggestion{}
	if len(qterms) == 0 {
		return out
	}
	prefix := strings.ToLower(strings.TrimSpace(text))
	seen := map[string]bool{}

	for _, p := range idx.docs {
		for i, name := range p.CategoryNames {
			if strings.HasPrefix(strings.ToLower(name), prefix) && i == 0 && !seen["c:"+p.Category] {
				seen["c:"+p.Category] = true
				out = append(out, Suggestion{Text: name, Slug: p.Category, Kind: "category"})
			}
		}
		if strings.HasPrefix(strings.ToLower(p.StoreName), prefix) && !seen["s:"+p.Store] {
			seen["s:"+p.Store] = true
			out = append(out, Suggestion{Text: p.StoreName, Slug: p.Store, Kind: "store"})
		}
		if len(out) >= 3 {
			break
		}
	}

	res := idx.Search(Query{Text: text, Sort: "popular", Page: 1, PageSize: limit * 2})
	byID := make(map[string]*Product, len(res.IDs))
	for i := range idx.docs {
		byID[idx.docs[i].ID] = &idx.docs[i]
	}
	for _, id := range res.IDs {
		p := byID[id]
		if p == nil || seen["p:"+p.Title] {
			continue
		}
		seen["p:"+p.Title] = true
		out = append(out, Suggestion{Text: p.Title, Slug: p.Slug, Kind: "product"})
		if len(out) >= limit {
			break
		}
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}
