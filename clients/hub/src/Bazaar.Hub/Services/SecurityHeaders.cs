using Microsoft.Extensions.Options;

namespace Bazaar.Hub.Services;

/// <summary>Strict headers on every response. Scripts and styles are files on this origin only.</summary>
public sealed class SecurityHeaders(RequestDelegate next, IOptions<HubOptions> options)
{
    private readonly string _csp = BuildCsp(options.Value);

    private static string BuildCsp(HubOptions o)
    {
        static string Origin(string url) =>
            Uri.TryCreate(url.Replace("{s}", "a").Replace("{z}", "0").Replace("{x}", "0").Replace("{y}", "0"), UriKind.Absolute, out var u)
                ? $"{u.Scheme}://{u.Authority}" : "";
        var media = string.Join(' ', new[] { Origin(o.MapTiles), Origin(o.SupabaseUrl) }.Where(s => s.Length > 0));
        return "default-src 'none'; script-src 'self'; style-src 'self'; " +
               $"img-src 'self' data: {media}; connect-src 'self'; font-src 'self'; " +
               "form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; manifest-src 'self'";
    }

    public Task InvokeAsync(HttpContext ctx)
    {
        // Set as the response starts, so nothing later in the pipeline can loosen them.
        ctx.Response.OnStarting(() =>
        {
            var h = ctx.Response.Headers;
            h.ContentSecurityPolicy = _csp;
            h.XContentTypeOptions = "nosniff";
            h.XFrameOptions = "DENY";
            h["Referrer-Policy"] = "strict-origin-when-cross-origin";
            h["Cross-Origin-Opener-Policy"] = "same-origin";
            h["Cross-Origin-Resource-Policy"] = "same-origin";
            h["Permissions-Policy"] = "geolocation=(), camera=(), microphone=(), payment=(), usb=()";
            if (ctx.User.Identity?.IsAuthenticated == true) h.CacheControl = "no-store";
            return Task.CompletedTask;
        });
        return next(ctx);
    }
}
