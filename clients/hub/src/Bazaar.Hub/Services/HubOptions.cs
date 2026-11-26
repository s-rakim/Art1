namespace Bazaar.Hub.Services;

public sealed class HubOptions
{
    /// <summary>The API inside the compose network, e.g. http://api:8000/ (no /api/v1).</summary>
    public string ApiUrl { get; set; } = "http://api:8000/";
    public string SupabaseUrl { get; set; } = "";
    public string SupabaseAnonKey { get; set; } = "";
    /// <summary>Where the hub is mounted on the site, e.g. /hub.</summary>
    public string PathBase { get; set; } = "/hub";
    public string StoreName { get; set; } = "The Bazaar";
    public string PortalUrl { get; set; } = "/portal/";
    public string ShopUrl { get; set; } = "/";
    public string MapCenter { get; set; } = "5.6037,-0.1870";
    public string MapTiles { get; set; } = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
    /// <summary>Folder for the data protection keys that sign cookies and antiforgery tokens.</summary>
    public string KeysDir { get; set; } = "";
    /// <summary>How long a hub sign-in lasts before asking again.</summary>
    public int SessionHours { get; set; } = 12;
}
