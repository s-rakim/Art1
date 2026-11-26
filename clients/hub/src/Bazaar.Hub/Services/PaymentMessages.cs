using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Bazaar.Hub.Services;

public sealed record PaymentMessage(
    string Code, string? Payer, string? PhoneMasked, decimal Amount, string Currency,
    DateTimeOffset? PaidAt, string Source, string Raw);

public sealed record ParseResult(IReadOnlyList<PaymentMessage> Payments, IReadOnlyList<string> Skipped, int Duplicates);

/// <summary>
/// Reads M-Pesa and bank SMS text (pasted, or exported from a phone as .txt/.csv)
/// and pulls out the transaction code, who paid, how much and when. This is the
/// input to the payment databank: a rider later types the code or the payer's
/// name to confirm an order was paid. Only money received is kept; balances,
/// sent money and promotional texts are skipped.
/// </summary>
public static partial class PaymentMessages
{
    public const int MaxMessages = 2000;

    // "RKT1AB2CD3 Confirmed." at the start of every M-Pesa receipt.
    [GeneratedRegex(@"\b([A-Z0-9]{10})\s+Confirmed\b", RegexOptions.CultureInvariant)]
    private static partial Regex MpesaCode();

    // "received Ksh1,250.00 from JOHN DOE 0712345678" (personal) or
    // "Ksh500.00 received from JANE W 2547***678" (till / paybill).
    [GeneratedRegex(@"(?:received\s+(?<cur>Ksh|KES)\s?(?<amt>[\d,]+(?:\.\d{1,2})?)\s+from|(?<cur>Ksh|KES)\s?(?<amt>[\d,]+(?:\.\d{1,2})?)\s+received\s+from)\s+(?<name>[A-Za-z][A-Za-z .'\-]{0,60}?)\s*(?<phone>(?:\+?254|0)[\d*]{6,12})?\s*(?:\.|on\b)",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex MpesaReceived();

    [GeneratedRegex(@"\bon\s+(?<d>\d{1,2}/\d{1,2}/\d{2,4})\s+at\s+(?<t>\d{1,2}:\d{2}\s?[AP]M)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex MpesaWhen();

    // Bank credit alerts: "... credited with KES 2,000.00 ... Ref: FT25331ABCD ... from JOHN DOE"
    [GeneratedRegex(@"credited\s+(?:with\s+)?(?<cur>KES|Ksh|USD|GHS)\s?(?<amt>[\d,]+(?:\.\d{1,2})?)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex BankCredit();

    [GeneratedRegex(@"\b(?:Ref(?:erence)?|Txn|Trans(?:action)?\s*(?:ID|code)?)[:.\s#]+(?<code>[A-Z0-9]{6,20})\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex BankRef();

    [GeneratedRegex(@"\bfrom\s+(?<name>[A-Z][A-Za-z .'\-]{1,60}?)(?:\s+(?:on|ref|via)\b|[.,]|$)", RegexOptions.CultureInvariant)]
    private static partial Regex BankFrom();

    public static ParseResult Parse(string text)
    {
        var payments = new List<PaymentMessage>();
        var skipped = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        int dupes = 0;
        foreach (var raw in Split(text).Take(MaxMessages))
        {
            var msg = Normalise(raw);
            var parsed = ParseMpesa(msg) ?? ParseBank(msg);
            if (parsed is null)
            {
                skipped.Add(msg.Length > 140 ? msg[..140] + "…" : msg);
                continue;
            }
            if (!seen.Add(parsed.Code)) { dupes++; continue; }
            payments.Add(parsed);
        }
        return new ParseResult(payments, skipped, dupes);
    }

    private static PaymentMessage? ParseMpesa(string msg)
    {
        var code = MpesaCode().Match(msg);
        var rec = MpesaReceived().Match(msg);
        if (!code.Success || !rec.Success) return null;
        if (!TryAmount(rec.Groups["amt"].Value, out var amount)) return null;
        return new PaymentMessage(code.Groups[1].Value, Title(rec.Groups["name"].Value), Mask(rec.Groups["phone"].Value),
            amount, "KES", When(msg), "M-Pesa", msg);
    }

    private static PaymentMessage? ParseBank(string msg)
    {
        var credit = BankCredit().Match(msg);
        var reference = BankRef().Match(msg);
        if (!credit.Success || !reference.Success) return null;
        if (!TryAmount(credit.Groups["amt"].Value, out var amount)) return null;
        var cur = credit.Groups["cur"].Value.ToUpperInvariant();
        var from = BankFrom().Match(msg);
        return new PaymentMessage(reference.Groups["code"].Value.ToUpperInvariant(), from.Success ? Title(from.Groups["name"].Value) : null,
            null, amount, cur == "KSH" ? "KES" : cur, null, "Bank", msg);
    }

    private static DateTimeOffset? When(string msg)
    {
        var m = MpesaWhen().Match(msg);
        if (!m.Success) return null;
        string[] formats = ["d/M/yy h:mm tt", "d/M/yyyy h:mm tt", "d/M/yy h:mmtt", "d/M/yyyy h:mmtt"];
        return DateTime.TryParseExact($"{m.Groups["d"].Value} {m.Groups["t"].Value.ToUpperInvariant()}", formats,
            CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt)
            ? new DateTimeOffset(dt, TimeSpan.FromHours(3)) // Safaricom timestamps are East Africa Time
            : null;
    }

    private static bool TryAmount(string s, out decimal amount) =>
        decimal.TryParse(s.Replace(",", ""), NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out amount) && amount > 0 && amount < 100_000_000;

    private static string Title(string name)
    {
        var clean = Regex.Replace(name.Trim(), @"\s+", " ");
        return CultureInfo.InvariantCulture.TextInfo.ToTitleCase(clean.ToLowerInvariant());
    }

    /// <summary>Phone numbers are personal data: keep only the last three digits.</summary>
    private static string? Mask(string phone)
    {
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        return digits.Length >= 3 ? "•••" + digits[^3..] : null;
    }

    private static string Normalise(string s) => Regex.Replace(s.Replace(' ', ' '), @"\s+", " ").Trim();

    /// <summary>One message per blank-line block, per CSV row, or per line that starts with a new code.</summary>
    private static IEnumerable<string> Split(string text)
    {
        var block = new StringBuilder();
        foreach (var line in text.Replace("\r\n", "\n").Split('\n'))
        {
            var starts = MpesaCode().IsMatch(line) && MpesaCode().Match(line).Index < 3;
            if (string.IsNullOrWhiteSpace(line) || (starts && block.Length > 0))
            {
                if (block.Length > 0) yield return block.ToString();
                block.Clear();
            }
            if (!string.IsNullOrWhiteSpace(line)) block.Append(line.Trim().Trim('"')).Append(' ');
        }
        if (block.Length > 0) yield return block.ToString();
    }

    public static string ToCsv(IEnumerable<PaymentMessage> rows)
    {
        var sb = new StringBuilder("code,payer,phone,amount,currency,paid_at,source\n");
        foreach (var p in rows)
            sb.Append(string.Join(',', InventorySync.Csv(p.Code), InventorySync.Csv(p.Payer), InventorySync.Csv(p.PhoneMasked),
                p.Amount.ToString("0.00", CultureInfo.InvariantCulture), p.Currency, p.PaidAt?.ToString("yyyy-MM-dd HH:mm zzz") ?? "",
                p.Source)).Append('\n');
        return sb.ToString();
    }
}
