using System.Collections.Concurrent;
using Bazaar.Api;
using Microsoft.Extensions.Options;

namespace Bazaar.Hub.Services;

/// <summary>
/// Holds each signed-in person's Supabase tokens on the server, keyed by a random
/// session id. The browser's cookie only carries that id (encrypted), never a token.
/// Sessions are in memory: a restart signs everyone out, which is the safe direction.
/// </summary>
public sealed class SessionStore(SupabaseAuth auth, IOptions<HubOptions> options, TimeProvider clock, ILogger<SessionStore> log)
{
    private sealed class Entry(AuthSession tokens, DateTimeOffset until)
    {
        public AuthSession Tokens = tokens;
        public DateTimeOffset Until = until;
        public readonly SemaphoreSlim Lock = new(1, 1);
    }

    private readonly ConcurrentDictionary<string, Entry> _sessions = new();

    public string Create(AuthSession tokens)
    {
        Sweep();
        var id = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));
        _sessions[id] = new Entry(tokens, clock.GetUtcNow().AddHours(options.Value.SessionHours));
        return id;
    }

    public bool Exists(string? id) =>
        id is not null && _sessions.TryGetValue(id, out var e) && e.Until > clock.GetUtcNow();

    /// <summary>A valid access token for the session, refreshed if it is about to expire. Null if the session is gone.</summary>
    public async Task<string?> AccessTokenAsync(string? id, CancellationToken ct = default)
    {
        if (id is null || !_sessions.TryGetValue(id, out var entry) || entry.Until <= clock.GetUtcNow())
            return null;
        if (entry.Tokens.ExpiresOn > clock.GetUtcNow().AddSeconds(60))
            return entry.Tokens.AccessToken;
        await entry.Lock.WaitAsync(ct);
        try
        {
            if (entry.Tokens.ExpiresOn > clock.GetUtcNow().AddSeconds(60))
                return entry.Tokens.AccessToken;
            entry.Tokens = await auth.RefreshAsync(entry.Tokens.RefreshToken, ct);
            return entry.Tokens.AccessToken;
        }
        catch (AuthException ex)
        {
            log.LogInformation("Session refresh failed ({Status}); signing out", ex.Status);
            _sessions.TryRemove(id, out _);
            return null;
        }
        finally
        {
            entry.Lock.Release();
        }
    }

    public async Task RemoveAsync(string? id)
    {
        if (id is not null && _sessions.TryRemove(id, out var e))
        {
            try { await auth.SignOutAsync(e.Tokens.AccessToken); } catch (HttpRequestException) { }
        }
    }

    private void Sweep()
    {
        var now = clock.GetUtcNow();
        foreach (var (k, v) in _sessions)
            if (v.Until <= now) _sessions.TryRemove(k, out _);
    }
}
