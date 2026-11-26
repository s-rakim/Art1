using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Bazaar.Hub.Tests;

/// <summary>Fake Supabase and API so the hub can be driven end to end in memory.</summary>
public sealed class FakeUpstream : HttpMessageHandler
{
    public string Role { get; set; } = "seller";
    public List<string> Calls { get; } = [];

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage req, CancellationToken ct)
    {
        Calls.Add($"{req.Method} {req.RequestUri!.AbsolutePath}");
        var path = req.RequestUri.AbsolutePath;
        if (path == "/auth/v1/token")
            return Json(new { access_token = "secret-access-token", refresh_token = "secret-refresh", expires_in = 3600 });
        if (path == "/auth/v1/logout") return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NoContent));
        if (path == "/api/v1/me")
            return Json(new
            {
                id = Guid.NewGuid(), email = "sam@example.com", full_name = "Sam Seller", first_name = "Sam", avatar_url = (string?)null,
                role = Role, signup_as = "customer", home = "/", rider_status = (string?)null, store = (object?)null,
            });
        if (path == "/api/v1/seller/inventory")
            return Json(new { items = Array.Empty<object>(), total = 0, page = 1, page_size = 100 });
        return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
    }

    private static Task<HttpResponseMessage> Json(object body) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
    {
        Content = new StringContent(JsonSerializer.Serialize(body), System.Text.Encoding.UTF8, "application/json"),
    });
}

public sealed class HubFactory : WebApplicationFactory<Program>
{
    public FakeUpstream Upstream { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Production");
        builder.UseSetting("Hub:PathBase", "/hub");
        builder.UseSetting("Hub:ApiUrl", "http://api.test/");
        builder.UseSetting("Hub:SupabaseUrl", "https://auth.test");
        builder.UseSetting("Hub:SupabaseAnonKey", "anon");
        builder.ConfigureServices(s =>
        {
            s.AddHttpClient("bazaar-api").ConfigurePrimaryHttpMessageHandler(() => Upstream);
            s.AddHttpClient("supabase").ConfigurePrimaryHttpMessageHandler(() => Upstream);
        });
    }
}

public class WebTests(HubFactory factory) : IClassFixture<HubFactory>
{
    private HttpClient Client(bool redirects = false) => factory.CreateClient(new WebApplicationFactoryClientOptions
    {
        AllowAutoRedirect = redirects, BaseAddress = new Uri("https://hub.test/hub/"), HandleCookies = true,
    });

    [Fact]
    public async Task Login_page_has_strict_headers_and_no_inline_script()
    {
        var resp = await Client().GetAsync("login");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var csp = resp.Headers.GetValues("Content-Security-Policy").Single();
        Assert.Contains("script-src 'self'", csp);
        Assert.DoesNotContain("unsafe", csp);
        Assert.Equal("DENY", resp.Headers.GetValues("X-Frame-Options").Single());
        var html = await resp.Content.ReadAsStringAsync();
        Assert.DoesNotMatch(@"<script(?![^>]*\bsrc=)", html);
        Assert.DoesNotContain("style=", html);
        Assert.Contains("__RequestVerificationToken", html);
    }

    [Theory]
    [InlineData("inventory")]
    [InlineData("payments")]
    [InlineData("export/orders.csv")]
    [InlineData("dispatch.json")]
    public async Task Signed_out_requests_go_to_login(string path)
    {
        var resp = await Client().GetAsync(path);
        Assert.Equal(HttpStatusCode.Redirect, resp.StatusCode);
        Assert.Contains("/hub/login", resp.Headers.Location!.ToString());
    }

    [Fact]
    public async Task Login_without_antiforgery_token_is_refused()
    {
        var resp = await Client().PostAsync("account/login", new FormUrlEncodedContent(new Dictionary<string, string>
        { ["email"] = "a@b.co", ["password"] = "x" }));
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    private static async Task<HttpResponseMessage> SignIn(HttpClient c, string returnUrl = "/")
    {
        var page = await (await c.GetAsync("login")).Content.ReadAsStringAsync();
        var token = System.Text.RegularExpressions.Regex.Match(page, "name=\"__RequestVerificationToken\" value=\"([^\"]+)\"").Groups[1].Value;
        return await c.PostAsync("account/login", new FormUrlEncodedContent(new Dictionary<string, string>
        { ["email"] = "sam@example.com", ["password"] = "pw", ["returnUrl"] = returnUrl, ["__RequestVerificationToken"] = token }));
    }

    [Fact]
    public async Task Sellers_get_in_and_tokens_never_reach_the_browser()
    {
        factory.Upstream.Role = "seller";
        var c = Client();
        var resp = await SignIn(c, "//evil.example/");
        Assert.Equal(HttpStatusCode.Redirect, resp.StatusCode);
        Assert.Equal("/hub/", resp.Headers.Location!.ToString()); // open redirect ignored
        var cookie = string.Join(";", resp.Headers.GetValues("Set-Cookie"));
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("secure", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("secret-access-token", cookie);

        var home = await c.GetAsync("");
        var html = await home.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, home.StatusCode);
        Assert.Contains("Sam", html);
        Assert.Contains("Stock import", html);
        Assert.DoesNotContain("secret-access-token", html);
        Assert.Equal("no-store", home.Headers.CacheControl!.ToString());

        var csv = await c.GetAsync("export/inventory.csv");
        Assert.Equal("text/csv", csv.Content.Headers.ContentType!.MediaType);
    }

    [Fact]
    public async Task Customers_and_riders_are_turned_away()
    {
        factory.Upstream.Role = "customer";
        var c = Client();
        var resp = await SignIn(c);
        Assert.Contains("login?error=", resp.Headers.Location!.ToString());
        Assert.Equal(HttpStatusCode.Redirect, (await c.GetAsync("inventory")).StatusCode);
    }

    [Fact]
    public async Task Sellers_cannot_open_admin_tools()
    {
        factory.Upstream.Role = "seller";
        var c = Client();
        await SignIn(c);
        var resp = await c.GetAsync("payments");
        var html = await resp.Content.ReadAsStringAsync();
        Assert.DoesNotContain("Paste one or many messages", html);
    }
}
