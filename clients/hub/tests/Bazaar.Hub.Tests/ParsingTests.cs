using Bazaar.Api;
using Bazaar.Hub.Services;

namespace Bazaar.Hub.Tests;

public class InventorySyncTests
{
    private static InventoryRow Row(string sku, int stock) => new()
    {
        Variant_id = Guid.NewGuid(), Product_id = Guid.NewGuid(), Product_title = "Kente scarf", Product_status = "active",
        Sku = sku, Title = "Default", Options = new Dictionary<string, string>(), Price_cents = 4550, Stock = stock,
    };

    [Fact]
    public void Plans_sets_adjustments_and_problems()
    {
        var csv = "SKU;Stock;Adjust\nA-1;10;\na-2;;-3\nB-9;5;\nA-1;4;\nC-3;abc;\nD-4;1;1\n";
        var rows = InventorySync.Parse(csv);
        var plan = InventorySync.Plan(rows, [Row("A-1", 7), Row("A-2", 5), Row("C-3", 1), Row("D-4", 1)]);

        var a1 = plan.Lines.Single(l => l.Row == 2);
        Assert.Equal((LineState.Change, 7, 10), (a1.State, a1.Current, a1.Target));
        var a2 = plan.Lines.Single(l => l.Row == 3);            // SKU match ignores case
        Assert.Equal((LineState.Change, 2), (a2.State, a2.Target));
        Assert.Equal(LineState.UnknownSku, plan.Lines.Single(l => l.Row == 4).State);
        Assert.Contains("twice", plan.Lines.Single(l => l.Row == 5).Problem);
        Assert.Equal(LineState.Invalid, plan.Lines.Single(l => l.Row == 6).State);
        Assert.Contains("not both", plan.Lines.Single(l => l.Row == 7).Problem);
        Assert.Equal(2, plan.ChangeCount);
    }

    [Fact]
    public void Never_plans_negative_stock()
    {
        var plan = InventorySync.Plan(InventorySync.Parse("sku,adjust\nA,-5\n"), [Row("A", 2)]);
        Assert.Equal(LineState.Invalid, plan.Lines[0].State);
        Assert.Empty(InventorySync.Batches(plan, "t"));
    }

    [Fact]
    public void Batches_respect_the_api_limit()
    {
        var current = Enumerable.Range(0, 450).Select(i => Row($"S{i}", 0)).ToList();
        var csv = "sku,stock\n" + string.Join("\n", Enumerable.Range(0, 450).Select(i => $"S{i},{i + 1}"));
        var batches = InventorySync.Batches(InventorySync.Plan(InventorySync.Parse(csv), current), "t").ToList();
        Assert.Equal([200, 200, 50], batches.Select(b => b.Items.Count));
    }

    [Fact]
    public void Rejects_files_without_the_right_columns()
    {
        Assert.Throws<FormatException>(() => InventorySync.Parse("name,price\nx,1\n"));
    }

    [Theory]
    [InlineData("=HYPERLINK(\"http://x\")", "\"'=HYPERLINK(\"\"http://x\"\")\"")]
    [InlineData("+1", "'+1")]
    [InlineData("@SUM(A1)", "'@SUM(A1)")]
    [InlineData("plain, with comma", "\"plain, with comma\"")]
    public void Csv_cells_are_safe_in_spreadsheets(string input, string expected) =>
        Assert.Equal(expected, InventorySync.Csv(input));
}

public class PaymentMessageTests
{
    [Fact]
    public void Reads_till_personal_and_bank_messages()
    {
        var text = """
            RKT1AB2CD3 Confirmed. Ksh1,250.00 received from JANE WANJIRU 254712345678 on 25/11/26 at 2:05 PM. New Account balance is Ksh9,000.00.
            QJK7XYZ123 Confirmed. You have received Ksh500.00 from JOHN DOE 0712345678 on 24/11/26 at 10:15 AM New M-PESA balance is Ksh3,100.00.

            Dear customer, your account 0123***89 has been credited with KES 2,000.00 from ACME TRADERS. Ref: FT25331ABCD
            SBX9QW8ER7 Confirmed. Ksh200.00 sent to KPLC PREPAID for account 1234 on 25/11/26 at 9:00 AM.
            RKT1AB2CD3 Confirmed. Ksh1,250.00 received from JANE WANJIRU 254712345678 on 25/11/26 at 2:05 PM.
            """;
        var r = PaymentMessages.Parse(text);

        Assert.Equal(3, r.Payments.Count);
        Assert.Equal(1, r.Duplicates);
        Assert.Single(r.Skipped); // money sent out is not a payment to the market

        var till = r.Payments[0];
        Assert.Equal(("RKT1AB2CD3", "Jane Wanjiru", 1250.00m, "KES"), (till.Code, till.Payer, till.Amount, till.Currency));
        Assert.Equal("•••678", till.PhoneMasked);
        Assert.Equal(new DateTimeOffset(2026, 11, 25, 14, 5, 0, TimeSpan.FromHours(3)), till.PaidAt);

        Assert.Equal(("QJK7XYZ123", "John Doe", 500m), (r.Payments[1].Code, r.Payments[1].Payer, r.Payments[1].Amount));
        Assert.Equal(("FT25331ABCD", "Acme Traders", 2000m, "Bank"), (r.Payments[2].Code, r.Payments[2].Payer, r.Payments[2].Amount, r.Payments[2].Source));
    }

    [Fact]
    public void Csv_keeps_full_phone_numbers_out()
    {
        var r = PaymentMessages.Parse("RKT1AB2CD3 Confirmed. Ksh10.00 received from A B 254712345678 on 1/1/26 at 1:00 PM.");
        var csv = PaymentMessages.ToCsv(r.Payments);
        Assert.DoesNotContain("712345678", csv);
        Assert.Contains("RKT1AB2CD3,A B,•••678,10.00,KES", csv);
    }
}
