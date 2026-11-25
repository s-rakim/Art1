using System.Security.Claims;
using Bazaar.Api;
using Bazaar.Hub.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;

namespace Bazaar.Hub.Endpoints;

public static class AccountEndpoints
{
    /// <summary>Roles that may use the hub. Everyone else is pointed back to the portal.</summary>
    public static readonly string[] Allowed = ["seller", "admin"];

    public static void MapAccountEndpoints(this WebApplication app)
    {
        // Plain form posts (antiforgery-checked), so tokens are handled entirely on the server.
        app.MapPost("/account/login", async (HttpContext ctx, [FromForm] string? email, [FromForm] string? password,
            [FromForm] string? returnUrl, SupabaseAuth auth, SessionStore sessions, IHttpClientFactory http) =>
        {
            string Back(string error) => $"{ctx.Request.PathBase}/login?error={Uri.EscapeDataString(error)}";
            if (string.IsNullOrWhiteSpace(email) || string.IsNullOrEmpty(password) || email.Length > 254 || password.Length > 200)
                return Results.Redirect(Back("Enter your email and password."));
            AuthSession tokens;
            try { tokens = await auth.SignInAsync(email.Trim(), password); }
            catch (AuthException ex) { return Results.Redirect(Back(ex.Message)); }
            catch (HttpRequestException) { return Results.Redirect(Back("Sign-in is unavailable right now.")); }

            Me me;
            try { me = await BazaarApi.Create(http.CreateClient("bazaar-api"), tokens.AccessToken).GetMeAsync(); }
            catch (Exception ex) { return Results.Redirect(Back(ApiAccess.Explain(ex))); }

            var role = me.Role.ToString().ToLowerInvariant();
            if (!Allowed.Contains(role))
            {
                try { await auth.SignOutAsync(tokens.AccessToken); } catch (HttpRequestException) { }
                return Results.Redirect(Back("The integrations hub is for stall owners and admins. Use the portal to shop or ride."));
            }

            var sid = sessions.Create(tokens);
            var identity = new ClaimsIdentity([
                new Claim(ClaimTypes.NameIdentifier, me.Id.ToString()),
                new Claim(ClaimTypes.Name, me.Full_name ?? me.Email ?? "You"),
                new Claim(ClaimTypes.Email, me.Email ?? ""),
                new Claim(ClaimTypes.Role, role),
                new Claim(HubClaims.FirstName, me.First_name ?? ""),
                new Claim(HubClaims.Session, sid),
            ], CookieAuthenticationDefaults.AuthenticationScheme);
            await ctx.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity));
            var target = returnUrl is { Length: > 0 } r && r.StartsWith('/') && !r.StartsWith("//") && !r.StartsWith("/\\") ? r : "/";
            return Results.LocalRedirect("~" + target);
        }).RequireRateLimiting("login").AllowAnonymous();

        app.MapPost("/account/logout", async (HttpContext ctx, SessionStore sessions) =>
        {
            await sessions.RemoveAsync(ctx.User.FindFirstValue(HubClaims.Session));
            await ctx.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.LocalRedirect("~/login");
        });
    }
}
