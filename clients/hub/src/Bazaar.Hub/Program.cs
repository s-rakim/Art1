using System.Security.Claims;
using System.Threading.RateLimiting;
using Bazaar.Api;
using Bazaar.Hub.Components;
using Bazaar.Hub.Endpoints;
using Bazaar.Hub.Services;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(k =>
{
    k.AddServerHeader = false;
    k.Limits.MaxRequestBodySize = 6 * 1024 * 1024; // CSV uploads are small
});

builder.Services.Configure<HubOptions>(builder.Configuration.GetSection("Hub"));
var hub = builder.Configuration.GetSection("Hub").Get<HubOptions>() ?? new HubOptions();

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddHttpClient("bazaar-api", (sp, c) =>
{
    c.BaseAddress = new Uri(sp.GetRequiredService<IOptions<HubOptions>>().Value.ApiUrl);
    c.Timeout = TimeSpan.FromSeconds(20);
    c.DefaultRequestHeaders.UserAgent.ParseAdd("bazaar-hub");
}).ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { AllowAutoRedirect = false });
builder.Services.AddHttpClient("supabase", c => c.Timeout = TimeSpan.FromSeconds(10))
    .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { AllowAutoRedirect = false });
builder.Services.AddSingleton(sp =>
{
    var o = sp.GetRequiredService<IOptions<HubOptions>>().Value;
    return new SupabaseAuth(sp.GetRequiredService<IHttpClientFactory>().CreateClient("supabase"), o.SupabaseUrl, o.SupabaseAnonKey);
});
builder.Services.AddSingleton<SessionStore>();
builder.Services.AddScoped<ApiAccess>();

var keys = builder.Services.AddDataProtection().SetApplicationName("bazaar-hub");
if (!string.IsNullOrEmpty(hub.KeysDir)) keys.PersistKeysToFileSystem(new DirectoryInfo(hub.KeysDir));

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o =>
    {
        o.Cookie.Name = "bazaar_hub";
        o.Cookie.HttpOnly = true;
        o.Cookie.SameSite = SameSiteMode.Lax;
        o.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
        o.ExpireTimeSpan = TimeSpan.FromHours(hub.SessionHours);
        o.SlidingExpiration = false;
        o.LoginPath = "/login";
        o.AccessDeniedPath = "/denied";
        // The cookie only names a server-side session. If that session is gone
        // (signed out elsewhere, restart, refresh failed), so is the sign-in.
        o.Events.OnValidatePrincipal = ctx =>
        {
            var store = ctx.HttpContext.RequestServices.GetRequiredService<SessionStore>();
            if (!store.Exists(ctx.Principal?.FindFirstValue(HubClaims.Session)))
                ctx.RejectPrincipal();
            return Task.CompletedTask;
        };
    });
builder.Services.AddAuthorization(o =>
{
    o.AddPolicy("seller", p => p.RequireRole("seller"));
    o.AddPolicy("staff", p => p.RequireRole("seller", "admin"));
});
builder.Services.AddCascadingAuthenticationState();
builder.Services.AddAntiforgery(o =>
{
    o.Cookie.Name = "bazaar_hub_af";
    o.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
});

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 8, Window = TimeSpan.FromMinutes(10), QueueLimit = 0 }));
});

builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    // Caddy is the only thing that can reach the hub (no published port).
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
    o.ForwardLimit = 1;
});

builder.Services.AddRazorComponents().AddInteractiveServerComponents(o =>
{
    o.DetailedErrors = builder.Environment.IsDevelopment();
    o.DisconnectedCircuitRetentionPeriod = TimeSpan.FromMinutes(3);
});
builder.Services.AddSignalR(o => o.MaximumReceiveMessageSize = 6 * 1024 * 1024);

var app = builder.Build();

app.UseForwardedHeaders();
if (!string.IsNullOrEmpty(hub.PathBase) && hub.PathBase != "/") app.UsePathBase(hub.PathBase);
app.UseMiddleware<SecurityHeaders>();
if (!app.Environment.IsDevelopment()) app.UseExceptionHandler("/error", createScopeForErrors: true);
app.UseStatusCodePagesWithReExecute("/not-found", createScopeForStatusCodePages: true);

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();

app.MapGet("/healthz", () => Results.Text("ok")).AllowAnonymous();
app.MapAccountEndpoints();
app.MapExportEndpoints();
app.MapStaticAssets();
app.MapRazorComponents<App>().AddInteractiveServerRenderMode();

app.Run();

public partial class Program;
