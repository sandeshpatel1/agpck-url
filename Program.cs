using AgroPackUrlManager.Data;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddRazorPages();
builder.Services.AddSingleton<ProductRepository>();

var app = builder.Build();

app.UseStaticFiles();
app.UseRouting();
app.MapRazorPages();

var api = app.MapGroup("/api");

api.MapGet("/search", (string table, string q, ProductRepository repo, IConfiguration cfg) =>
    Run(cfg, async () => new { ok = true, items = await repo.SearchAsync(table, q) }));

api.MapGet("/product", (string table, string pk, ProductRepository repo, IConfiguration cfg) =>
    Run(cfg, async () =>
    {
        var p = await repo.GetByPkAsync(table, pk);
        return p == null
            ? (object)new { ok = false, message = "Product not found." }
            : new { ok = true, item = p };
    }));

api.MapPost("/saveurl", (SaveUrlRequest req, ProductRepository repo, IConfiguration cfg) =>
    Run(cfg, async () =>
    {
        bool updated = await repo.UpdateUrlAsync(req.Table, req.Pk, req.Url);
        return updated
            ? (object)new { ok = true }
            : new { ok = false, message = "Not updated: product not found or it already has a URL." };
    }));

app.Run();

static async Task<IResult> Run(IConfiguration cfg, Func<Task<object>> action)
{
    try
    {
        return Results.Json(await action());
    }
    catch (ArgumentException ex)
    {
        return Results.Json(new { ok = false, message = ex.Message });
    }
    catch (Exception ex)
    {
        bool details = cfg.GetValue<bool>("ShowErrorDetails");
        return Results.Json(new
        {
            ok = false,
            message = details ? ex.Message : "Server error. Please check the configuration."
        });
    }
}

public record SaveUrlRequest(string Table, string Pk, string Url);
