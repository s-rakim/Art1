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

    private static IResult Csv(string body, string name) =>
        Results.File(Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(body)).ToArray(), "text/csv; charset=utf-8",
            $"bazaar-{name}-{DateTime.UtcNow:yyyyMMdd-HHmm}.csv");
}
