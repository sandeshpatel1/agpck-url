using System.Data;
using System.Globalization;
using Microsoft.Data.SqlClient;

namespace AgroPackUrlManager.Data;

public record ProductInfo(string Pk, string Sku, string Name, string Client, string Mrp, string Url);

public class ProductRepository
{
    // Whitelist: only these tables can ever be queried.
    public static readonly string[] Tables =
    {
        "macNew_agro_Product_master",
        "mac_agro_Product_master"
    };

    private readonly IConfiguration _config;

    public ProductRepository(IConfiguration config)
    {
        _config = config;
    }

    private string ConnStr
    {
        get
        {
            var cs = _config.GetConnectionString("AgroPackDb");
            if (string.IsNullOrWhiteSpace(cs))
                throw new InvalidOperationException("Connection string 'AgroPackDb' is missing in appsettings.json.");
            return cs;
        }
    }

    public static string ResolveTable(string name)
    {
        foreach (var t in Tables)
            if (string.Equals(t, name, StringComparison.Ordinal)) return t;
        throw new ArgumentException("Invalid table selected.");
    }

    private static string Q(string table) => "[dbo].[" + ResolveTable(table) + "]";

    private static string S(IDataRecord r, string col)
    {
        object v = r[col];
        if (v == DBNull.Value) return null;
        string s = Convert.ToString(v, CultureInfo.InvariantCulture).Trim();
        return s.Length == 0 ? null : s;
    }

    private static string EscapeLike(string s) =>
        s.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_").Replace("[", "\\[");

    public async Task<List<ProductInfo>> SearchAsync(string table, string term)
    {
        var list = new List<ProductInfo>();
        term = (term ?? "").Trim();
        if (term.Length < 2) return list;
        if (term.Length > 100) term = term.Substring(0, 100);

        string sql = "SELECT TOP (15) [PK],[SKU_code],[Product_name],[Client_company] FROM " + Q(table) +
                     " WHERE [Product_name] LIKE @q ESCAPE '\\' ORDER BY [Product_name]";

        using var con = new SqlConnection(ConnStr);
        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.Add(new SqlParameter("@q", SqlDbType.NVarChar, 400) { Value = "%" + EscapeLike(term) + "%" });
        await con.OpenAsync();
        using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new ProductInfo(S(r, "PK"), S(r, "SKU_code"), S(r, "Product_name"), S(r, "Client_company"), null, null));
        }
        return list;
    }

    public async Task<ProductInfo> GetByPkAsync(string table, string pk)
    {
        if (string.IsNullOrWhiteSpace(pk)) throw new ArgumentException("Product id is missing.");

        string sql = "SELECT TOP (1) [PK],[SKU_code],[Product_name],[Client_company],[MRP],[URL] FROM " + Q(table) +
                     " WHERE [PK] = @pk";

        using var con = new SqlConnection(ConnStr);
        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.Add(new SqlParameter("@pk", SqlDbType.NVarChar, 100) { Value = pk.Trim() });
        await con.OpenAsync();
        using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return null;
        return new ProductInfo(S(r, "PK"), S(r, "SKU_code"), S(r, "Product_name"), S(r, "Client_company"),
                               S(r, "MRP"), S(r, "URL"));
    }

    /// <summary>
    /// Sets URL (and ModifyDate) for a product. Only updates when the current URL is empty,
    /// so an existing URL is never overwritten by accident.
    /// </summary>
    public async Task<bool> UpdateUrlAsync(string table, string pk, string url)
    {
        if (string.IsNullOrWhiteSpace(pk)) throw new ArgumentException("Product id is missing.");
        url = (url ?? "").Trim();

        bool okScheme = url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                        url.StartsWith("https://", StringComparison.OrdinalIgnoreCase);
        if (!okScheme || !Uri.TryCreate(url, UriKind.Absolute, out _))
            throw new ArgumentException("URL must be valid and start with http:// or https://");

        string sql = "UPDATE " + Q(table) + " SET [URL] = @url, [ModifyDate] = GETDATE() " +
                     "WHERE [PK] = @pk AND ([URL] IS NULL OR LTRIM(RTRIM([URL])) = '')";

        using var con = new SqlConnection(ConnStr);
        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.Add(new SqlParameter("@url", SqlDbType.NVarChar, -1) { Value = url });
        cmd.Parameters.Add(new SqlParameter("@pk", SqlDbType.NVarChar, 100) { Value = pk.Trim() });
        await con.OpenAsync();
        return await cmd.ExecuteNonQueryAsync() > 0;
    }
}
