package main

import (
	"context"
	"log/slog"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Loader keeps an Index in step with Postgres. It does a full load at
// start, rebuilds (debounced) whenever the catalogue_changed notification
// fires, and rebuilds every few minutes regardless in case a notification
// was missed while disconnected. Rebuilding everything is simple and fast
// enough for hundreds of thousands of listings; swap in incremental updates
// if the catalogue ever outgrows that.
type Loader struct {
	pool       *pgxpool.Pool
	dsn        string
	current    atomic.Pointer[Index]
	categories atomic.Pointer[map[string]string] // slug -> id
	dirty      chan struct{}
}

const loadSQL = `
with recursive tree as (
    select id, parent_id, name, slug, array[id] as path, array[name] as names
      from categories where parent_id is null
    union all
    select c.id, c.parent_id, c.name, c.slug, t.path || c.id, t.names || c.name
      from categories c join tree t on c.parent_id = t.id
)
select p.id::text, p.slug, p.title, coalesce(p.brand, ''), left(p.description, 2000), p.tags,
       coalesce(t.slug, ''), coalesce(t.path::text[], '{}'), coalesce(t.names, '{}'),
       s.slug, s.name, coalesce(p.min_price_cents, 0), p.rating_avg::float8, p.sold_count, p.created_at
  from products p
  join stores s on s.id = p.store_id
  left join tree t on t.id = p.category_id
 where p.status = 'active' and s.status = 'active'
   and exists (select 1 from product_variants v where v.product_id = p.id and v.is_active)`

func NewLoader(pool *pgxpool.Pool, dsn string) *Loader {
	l := &Loader{pool: pool, dsn: dsn, dirty: make(chan struct{}, 1)}
	l.current.Store(Build(nil))
	empty := map[string]string{}
	l.categories.Store(&empty)
	return l
}

func (l *Loader) Index() *Index { return l.current.Load() }

func (l *Loader) CategoryID(slug string) (string, bool) {
	id, ok := (*l.categories.Load())[slug]
	return id, ok
}

func (l *Loader) Reload(ctx context.Context) error {
	start := time.Now()
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	rows, err := l.pool.Query(ctx, loadSQL)
	if err != nil {
		return err
	}
	var products []Product
	for rows.Next() {
		var p Product
		var rating float64
		if err := rows.Scan(&p.ID, &p.Slug, &p.Title, &p.Brand, &p.Description, &p.Tags, &p.Category,
			&p.CategoryIDs, &p.CategoryNames, &p.Store, &p.StoreName, &p.PriceCents, &rating, &p.Sold,
			&p.CreatedAt); err != nil {
			rows.Close()
			return err
		}
		p.Rating = rating
		// Own category name first, then its parents, so suggestions show the
		// most specific name.
		for i, j := 0, len(p.CategoryNames)-1; i < j; i, j = i+1, j-1 {
			p.CategoryNames[i], p.CategoryNames[j] = p.CategoryNames[j], p.CategoryNames[i]
		}
		products = append(products, p)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	cats := map[string]string{}
	crows, err := l.pool.Query(ctx, `select slug, id::text from categories`)
	if err != nil {
		return err
	}
	for crows.Next() {
		var slug, id string
		if err := crows.Scan(&slug, &id); err != nil {
			crows.Close()
			return err
		}
		cats[slug] = id
	}
	crows.Close()

	l.current.Store(Build(products))
	l.categories.Store(&cats)
	slog.Info("index rebuilt", "products", len(products), "took", time.Since(start).Round(time.Millisecond))
	return nil
}

func (l *Loader) markDirty() {
	select {
	case l.dirty <- struct{}{}:
	default:
	}
}

// Run blocks until ctx is done.
func (l *Loader) Run(ctx context.Context) {
	go l.listen(ctx)
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			l.markDirty()
		case <-l.dirty:
			// Debounce: a seller saving 50 variants causes one rebuild.
			time.Sleep(2 * time.Second)
			select {
			case <-l.dirty:
			default:
			}
			if err := l.Reload(ctx); err != nil {
				slog.Error("index rebuild failed", "err", err)
			}
		}
	}
}

func (l *Loader) listen(ctx context.Context) {
	for ctx.Err() == nil {
		conn, err := pgx.Connect(ctx, l.dsn)
		if err != nil {
			slog.Warn("listen connect failed", "err", err)
			time.Sleep(3 * time.Second)
			continue
		}
		if _, err := conn.Exec(ctx, "listen catalog_changed"); err != nil {
			slog.Warn("listen failed", "err", err)
			conn.Close(context.Background())
			time.Sleep(3 * time.Second)
			continue
		}
		// We may have missed changes while disconnected.
		l.markDirty()
		for {
			if _, err := conn.WaitForNotification(ctx); err != nil {
				if ctx.Err() == nil {
					slog.Warn("listen dropped", "err", err)
				}
				break
			}
			l.markDirty()
		}
		conn.Close(context.Background())
	}
}
