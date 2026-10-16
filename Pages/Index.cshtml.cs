using AgroPackUrlManager.Data;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace AgroPackUrlManager.Pages;

public class IndexModel : PageModel
{
    public string[] Tables => ProductRepository.Tables;
}
