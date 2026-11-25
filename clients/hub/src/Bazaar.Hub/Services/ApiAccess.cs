using System.Security.Claims;
using Bazaar.Api;
using Microsoft.AspNetCore.Components.Authorization;

namespace Bazaar.Hub.Services;

public static class HubClaims
{
    public const string Session = "bazaar:sid";
    public const string FirstName = "bazaar:first_name";
}

/// <summary>Gives pages a typed API client acting as the signed-in person.</summary>
public sealed class ApiAccess(IHttpClientFactory http, SessionStore sessions, AuthenticationStateProvider auth)
{
    public async Task<BazaarApiClient> ClientAsync(CancellationToken ct = default)
    {
        var state = await auth.GetAuthenticationStateAsync();
        return await ForAsync(state.User, ct);
    }

    public async Task<BazaarApiClient> ForAsync(ClaimsPrincipal user, CancellationToken ct = default)
    {
        var token = await sessions.AccessTokenAsync(user.FindFirstValue(HubClaims.Session), ct)
                    ?? throw new UnauthorizedAccessException("Your session has ended. Sign in again.");
        return BazaarApi.Create(http.CreateClient("bazaar-api"), token);
    }

    /// <summary>A short, human message for an API failure.</summary>
    public static string Explain(Exception ex) => ex switch
    {
        UnauthorizedAccessException u => u.Message,
        ApiException { StatusCode: 401 } => "Your session has ended. Sign in again.",
        ApiException { StatusCode: 403 } => "Your account isn't allowed to do that.",
        ApiException { StatusCode: 404 } => "That no longer exists.",
        ApiException { StatusCode: 429 } => "Too many requests. Wait a minute and try again.",
        ApiException { StatusCode: >= 400 and < 500 } a => ReadMessage(a.Response) ?? "The shop didn't accept that.",
        ApiException => "The shop is having trouble right now. Try again shortly.",
        HttpRequestException or TaskCanceledException => "The shop can't be reached right now.",
        _ => "Something went wrong.",
    };

    private static string? ReadMessage(string? body)
    {
        if (string.IsNullOrEmpty(body)) return null;
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(body);
            return doc.RootElement.TryGetProperty("error", out var e) && e.TryGetProperty("message", out var m)
                ? m.GetString() : null;
        }
        catch (System.Text.Json.JsonException) { return null; }
    }
}
