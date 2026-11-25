using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Bazaar.Api;

/// <summary>Tokens for one signed-in person, as Supabase hands them out.</summary>
public sealed record AuthSession(
    [property: JsonPropertyName("access_token")] string AccessToken,
    [property: JsonPropertyName("refresh_token")] string RefreshToken,
    [property: JsonPropertyName("expires_in")] int ExpiresIn,
    [property: JsonPropertyName("expires_at")] long? ExpiresAt)
{
    public DateTimeOffset ExpiresOn =>
        ExpiresAt is { } at ? DateTimeOffset.FromUnixTimeSeconds(at) : DateTimeOffset.UtcNow.AddSeconds(ExpiresIn);
}

public sealed class AuthException(string message, int status) : Exception(message)
{
    public int Status { get; } = status;
}

/// <summary>
/// Email and password sign-in against the same Supabase project the shop uses.
/// Only the public anon key is needed; roles come from the API's GET /me, never from the token.
/// </summary>
public sealed class SupabaseAuth(HttpClient http, string supabaseUrl, string anonKey)
{
    private readonly string _base = supabaseUrl.TrimEnd('/') + "/auth/v1";

    public Task<AuthSession> SignInAsync(string email, string password, CancellationToken ct = default) =>
        PostAsync("/token?grant_type=password", new { email, password }, null, ct);

    public Task<AuthSession> RefreshAsync(string refreshToken, CancellationToken ct = default) =>
        PostAsync("/token?grant_type=refresh_token", new { refresh_token = refreshToken }, null, ct);

    public async Task SignOutAsync(string accessToken, CancellationToken ct = default)
    {
        using var req = Request("/logout?scope=local", new { }, accessToken);
        using var _ = await http.SendAsync(req, ct);
    }

    private HttpRequestMessage Request(string path, object body, string? bearer)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, _base + path) { Content = JsonContent.Create(body) };
        req.Headers.Add("apikey", anonKey);
        if (bearer is not null) req.Headers.Authorization = new("Bearer", bearer);
        return req;
    }

    private async Task<AuthSession> PostAsync(string path, object body, string? bearer, CancellationToken ct)
    {
        using var req = Request(path, body, bearer);
        using var resp = await http.SendAsync(req, ct);
        if (!resp.IsSuccessStatusCode)
        {
            var status = (int)resp.StatusCode;
            throw new AuthException(status switch
            {
                400 or 401 => "That email and password don't match an account.",
                429 => "Too many attempts. Wait a few minutes and try again.",
                _ => "Sign-in is unavailable right now. Try again in a minute.",
            }, status);
        }
        return await resp.Content.ReadFromJsonAsync<AuthSession>(ct)
               ?? throw new AuthException("Sign-in sent back something unexpected.", 502);
    }
}

/// <summary>Builds API clients for a given access token.</summary>
public static class BazaarApi
{
    public static BazaarApiClient Create(HttpClient http, string accessToken)
    {
        // One HttpClient per caller: the token lives on the client's default headers.
        http.DefaultRequestHeaders.Authorization = new("Bearer", accessToken);
        return new BazaarApiClient(http);
    }
}
