package main

import (
	"testing"
	"time"
)

func catalogue() []Product {
	now := time.Now()
	return []Product{
		{ID: "1", Slug: "linen-dress", Title: "Linen summer dress", Brand: "Osu Atelier", Category: "women-dresses",
			CategoryIDs: []string{"c-women", "c-dresses"}, CategoryNames: []string{"Dresses", "Women"},
			Store: "osu", StoreName: "Osu Atelier", PriceCents: 2500, Sold: 40, Rating: 4.6, CreatedAt: now},
		{ID: "2", Slug: "cotton-shirt", Title: "Cotton oxford shirt", Brand: "Kente & Co", Category: "men-tops",
			CategoryIDs: []string{"c-men", "c-tops"}, CategoryNames: []string{"T-shirts & Shirts", "Men"},
			Store: "kente", StoreName: "Kente and Co", PriceCents: 1800, Sold: 5, CreatedAt: now.Add(-time.Hour)},
		{ID: "3", Slug: "wireless-earbuds", Title: "Wireless earbuds with charging case", Brand: "Soundwave",
			Category: "electronics-audio", CategoryIDs: []string{"c-elec", "c-audio"},
			CategoryNames: []string{"Audio", "Electronics"}, Store: "tech", StoreName: "Tech Hub",
			PriceCents: 4900, Sold: 100, CreatedAt: now.Add(-2 * time.Hour)},
		{ID: "4", Slug: "maxi-dresses", Title: "Printed maxi dresses", Brand: "Osu Atelier",
			Category: "women-dresses", CategoryIDs: []string{"c-women", "c-dresses"},
			CategoryNames: []string{"Dresses", "Women"}, Store: "osu", StoreName: "Osu Atelier",
			PriceCents: 3900, Sold: 2, CreatedAt: now.Add(-3 * time.Hour)},
	}
}

func q(text string) Query { return Query{Text: text, Sort: "relevance", Page: 1, PageSize: 10} }

func TestPluralsMatch(t *testing.T) {
	res := Build(catalogue()).Search(q("dress"))
	if res.Total != 2 {
		t.Fatalf("want 2 dresses, got %d %v", res.Total, res.IDs)
	}
}

func TestTypo(t *testing.T) {
	res := Build(catalogue()).Search(q("earbuds wirless"))
	if len(res.IDs) == 0 || res.IDs[0] != "3" {
		t.Fatalf("typo not tolerated: %v", res.IDs)
	}
	if res.Corrected == "" {
		t.Fatal("expected a correction hint")
	}
}

func TestTransposition(t *testing.T) {
	res := Build(catalogue()).Search(q("shrit"))
	if len(res.IDs) == 0 || res.IDs[0] != "2" {
		t.Fatalf("transposition not tolerated: %v", res.IDs)
	}
}

func TestPrefixWhileTyping(t *testing.T) {
	res := Build(catalogue()).Search(q("wirel"))
	if len(res.IDs) != 1 || res.IDs[0] != "3" {
		t.Fatalf("prefix: %v", res.IDs)
	}
}

func TestCategoryFilterIncludesChildren(t *testing.T) {
	query := q("")
	query.CategoryID = "c-women"
	res := Build(catalogue()).Search(query)
	if res.Total != 2 {
		t.Fatalf("want 2 in women, got %d", res.Total)
	}
}

func TestPriceSortAndFilter(t *testing.T) {
	query := q("")
	query.Sort = "price_asc"
	max := int64(4000)
	query.MaxPrice = &max
	res := Build(catalogue()).Search(query)
	want := []string{"2", "1", "4"}
	for i, id := range want {
		if res.IDs[i] != id {
			t.Fatalf("order: got %v want %v", res.IDs, want)
		}
	}
}

func TestFacets(t *testing.T) {
	res := Build(catalogue()).Search(q(""))
	if res.Facets["brand"][0].Label != "Osu Atelier" || res.Facets["brand"][0].Count != 2 {
		t.Fatalf("brand facets: %+v", res.Facets["brand"])
	}
}

func TestAccentsFold(t *testing.T) {
	res := Build(catalogue()).Search(q("LÍNEN"))
	if res.Total != 1 {
		t.Fatalf("accents: %v", res.IDs)
	}
}

func TestSuggest(t *testing.T) {
	s := Build(catalogue()).Suggest("dre", 5)
	if len(s) == 0 {
		t.Fatal("no suggestions")
	}
	foundCategory := false
	for _, x := range s {
		if x.Kind == "category" && x.Slug == "women-dresses" {
			foundCategory = true
		}
	}
	if !foundCategory {
		t.Fatalf("expected the Dresses category: %+v", s)
	}
}

func TestHostileInput(t *testing.T) {
	idx := Build(catalogue())
	for _, s := range []string{"' or 1=1 --", "%%%", "\x00\x01", "🙂🙂🙂", string(make([]byte, 5000))} {
		_ = idx.Search(q(s))
		_ = idx.Suggest(s, 5)
	}
}

func TestEmptyIndex(t *testing.T) {
	res := Build(nil).Search(q("anything"))
	if res.Total != 0 || res.IDs == nil {
		t.Fatalf("empty index: %+v", res)
	}
}
