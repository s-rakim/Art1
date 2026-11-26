using System.Globalization;
using System.Security.Claims;
using System.Text;
using Bazaar.Hub.Services;

namespace Bazaar.Hub.Endpoints;

/// <summary>CSV downloads for accounting tools and spreadsheets.</summary>
public static class ExportEndpoints
{
    public static void MapExportEndpoints(this WebApplication app)
    {
        app.MapGet("/export/inventory.csv", async (HttpContext ctx, ApiAccess access, CancellationToken ct) =>
        {
            var api = await access.ForAsync(ctx.User, ct);
            var rows = await InventorySync.LoadAllAsync(api, ct);
            return Csv(InventorySync.ToCsv(rows), "inventory");
        }).RequireAuthorization("seller");

        app.MapGet("/export/orders.csv", async (HttpContext ctx, ApiAccess access, CancellationToken ct) =>
        {
            var api = await access.ForAsync(ctx.User, ct);
            var sb = new StringBuilder();
            static string Money(int cents) => (cents / 100m).ToString("0.00", CultureInfo.InvariantCulture);
            if (ctx.User.IsInRole("admin"))
            {
                sb.Append("order,created,status,customer,stores,items,total,currency\n");
                for (var page = 1; page <= 50; page++)
                {
                    var p = await api.AdminOrdersAsync(page: page, page_size: 100, cancellationToken: ct);
                    foreach (var o in p.Items)
                        sb.Append(string.Join(',', InventorySync.Csv(o.Number), o.Created_at.ToString("u"), InventorySync.Csv(o.Status),
                            InventorySync.Csv(o.Customer_email), o.Stores, o.Item_count, Money(o.Total_cents), o.Currency)).Append('\n');
                    if (page * 100 >= p.Total || p.Items.Count == 0) break;
                }
            }
            else
            {
                sb.Append("order,created,status,paid,payment_method,subtotal,shipping,commission,fees,payout,currency\n");
                for (var page = 1; page <= 50; page++)
                {
                    var p = await api.SellerOrdersAsync(page: page, page_size: 100, cancellationToken: ct);
                    foreach (var o in p.Items)
                        sb.Append(string.Join(',', InventorySync.Csv(o.Order_number), o.Created_at.ToString("u"), InventorySync.Csv(o.Status),
                            o.Paid ? "yes" : "no", InventorySync.Csv(o.Payment_method), Money(o.Subtotal_cents), Money(o.Shipping_cents),
                            Money(o.Commission_cents), Money(o.Fee_cents), Money(o.Payout_cents), o.Currency)).Append('\n');
                    if (page * 100 >= p.Total || p.Items.Count == 0) break;
                }
            }
            return Csv(sb.ToString(), "orders");
        }).RequireAuthorization("staff");
    }

    /// <summary>The dispatch board's map feed, in the shape the shared map.js draws.</summary>
    public static void MapDispatchFeed(this WebApplication app)
    {
        app.MapGet("/dispatch.json", async (HttpContext ctx, ApiAccess access, CancellationToken ct) =>
        {
            var api = await access.ForAsync(ctx.User, ct);
            var markers = new List<object>();
            var rows = new List<object>();
            if (ctx.User.IsInRole("admin"))
            {
                var live = await api.AdminLiveMapAsync(ct);
                foreach (var r in live.Riders.Where(r => r.Lat is not null && r.Lng is not null))
                    markers.Add(new { kind = "rider", lat = r.Lat, lng = r.Lng, label = $"{r.Name} · {r.Vehicle} · {(r.Busy ? "busy" : "free")}" });
                foreach (var d in live.Deliveries)
                {
                    if (d.Pickup is { } p) markers.Add(new { kind = "store", lat = p.Lat, lng = p.Lng, label = d.Store_name });
                    if (d.Dropoff is { } o) markers.Add(new { kind = "home", lat = o.Lat, lng = o.Lng, label = $"Order {d.Order_number}" });
                    rows.Add(new { order = d.Order_number, store = d.Store_name, rider = d.Rider_name, status = d.Status });
                }
            }
            else
            {
                var me = await api.SellerMeAsync(ct);
                if (me.Store.Pickup_lat is { } slat && me.Store.Pickup_lng is { } slng)
                    markers.Add(new { kind = "store", lat = slat, lng = slng, label = me.Store.Name });
                foreach (var r in (await api.SellerStoreRidersAsync(ct)).Where(r => r.Lat is not null && r.Lng is not null))
                    markers.Add(new { kind = "rider", lat = r.Lat, lng = r.Lng, label = $"{r.Name} · {r.Vehicle}" });
                foreach (var d in (await api.SellerStoreDeliveriesAsync(active: true, page_size: 50, cancellationToken: ct)).Items)
                {
                    if (d.Dropoff is { } o) markers.Add(new { kind = "home", lat = o.Lat, lng = o.Lng, label = $"Order {d.Order_number}" });
                    rows.Add(new { order = d.Order_number, store = me.Store.Name, rider = d.Rider_name, status = d.Status });
                }
            }
            return Results.Json(new { markers, rows, count = rows.Count });
        }).RequireAuthorization("staff");
    }

    private static IResult Csv(string body, string name) =>
        Results.File(Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(body)).ToArray(), "text/csv; charset=utf-8",
            $"bazaar-{name}-{DateTime.UtcNow:yyyyMMdd-HHmm}.csv");
}
