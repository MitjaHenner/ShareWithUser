using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.Loader;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.ShareWithUser.Services;

/// <summary>
/// Registers JavaScript snippets with the JavaScript Injector plugin.
/// </summary>
public class JavaScriptRegistrationService
{
    private readonly ILogger _logger;
    private readonly Plugin _plugin;

    /// <summary>
    /// Initializes a new instance of the <see cref="JavaScriptRegistrationService"/> class.
    /// </summary>
    /// <param name="logger">Logger instance.</param>
    /// <param name="plugin">Plugin instance.</param>
    public JavaScriptRegistrationService(ILogger logger, Plugin plugin)
    {
        _logger = logger;
        _plugin = plugin;
    }

    /// <summary>
    /// Registers the context menu script with JavaScript Injector.
    /// Uses a retry loop because plugin load order is non-deterministic;
    /// JavaScript Injector may not be loaded when this plugin's constructor runs.
    /// </summary>
    public void RegisterContextMenuScript()
    {
        var script = LoadEmbeddedScript("Jellyfin.Plugin.ShareWithUser.Scripts.context-menu.js");
        if (script is null)
        {
            _logger.LogWarning("Failed to load context-menu.js embedded resource.");
            return;
        }

        // Fire-and-forget async task: retry finding JavaScript Injector for up to 10 seconds
        _ = Task.Run(() => RegisterScriptAsync(script, CancellationToken.None));
    }

    private async Task RegisterScriptAsync(string script, CancellationToken cancellationToken)
    {
        const int maxAttempts = 20;
        const int delayMs = 500;

        for (int attempt = 0; attempt < maxAttempts; attempt++)
        {
            if (cancellationToken.IsCancellationRequested)
            {
                return;
            }

            try
            {
                var jsInjectorAssembly = FindJavaScriptInjectorAssembly();

                if (jsInjectorAssembly is not null)
                {
                    await ExecuteRegistration(jsInjectorAssembly, script, cancellationToken).ConfigureAwait(false);
                    return;
                }

                _logger.LogDebug(
                    "JavaScript Injector not yet loaded, retrying in {DelayMs}ms (attempt {Attempt}/{MaxAttempts})...",
                    delayMs,
                    attempt + 1,
                    maxAttempts);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error while attempting to register context menu script.");
            }

            await Task.Delay(delayMs, cancellationToken).ConfigureAwait(false);
        }

        _logger.LogWarning("JavaScript Injector plugin not found after {MaxAttempts} attempts — context menu item will not appear.", maxAttempts);
    }

    private async Task ExecuteRegistration(Assembly jsInjectorAssembly, string script, CancellationToken cancellationToken)
    {
        var pluginInterfaceType = jsInjectorAssembly.GetType("Jellyfin.Plugin.JavaScriptInjector.PluginInterface");
        if (pluginInterfaceType is null)
        {
            _logger.LogWarning("JavaScript Injector PluginInterface type not found.");
            return;
        }

        var scriptRegistration = new JObject
        {
            { "id", $"{_plugin.Id}-context-menu" },
            { "name", "ShareWithUser Context Menu" },
            { "script", script },
            { "enabled", true },
            { "requiresAuthentication", true },
            { "pluginId", _plugin.Id.ToString() },
            { "pluginName", _plugin.Name },
            { "pluginVersion", _plugin.Version.ToString() }
        };

        var registerResult = pluginInterfaceType.GetMethod("RegisterScript")?.Invoke(null, new object[] { scriptRegistration });

        if (registerResult is bool success && success)
        {
            _logger.LogInformation("Successfully registered context menu script with JavaScript Injector.");
        }
        else
        {
            _logger.LogWarning("Failed to register context menu script with JavaScript Injector.");
        }
    }

    private static Assembly? FindJavaScriptInjectorAssembly()
    {
        return AssemblyLoadContext.All
            .SelectMany(x => x.Assemblies)
            .FirstOrDefault(x => x.FullName?.Contains("Jellyfin.Plugin.JavaScriptInjector", StringComparison.Ordinal) ?? false);
    }

    /// <summary>
    /// Unregisters all scripts from this plugin.
    /// </summary>
    public void UnregisterScripts()
    {
        try
        {
            var jsInjectorAssembly = AssemblyLoadContext.All
                .SelectMany(x => x.Assemblies)
                .FirstOrDefault(x => x.FullName?.Contains("Jellyfin.Plugin.JavaScriptInjector", StringComparison.Ordinal) ?? false);

            if (jsInjectorAssembly is null)
            {
                return;
            }

            var pluginInterfaceType = jsInjectorAssembly.GetType("Jellyfin.Plugin.JavaScriptInjector.PluginInterface");
            pluginInterfaceType?.GetMethod("UnregisterAllScriptsFromPlugin")?.Invoke(null, new object[] { _plugin.Id.ToString() });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to unregister scripts from JavaScript Injector.");
        }
    }

    private static string? LoadEmbeddedScript(string resourceName)
    {
        var assembly = Assembly.GetExecutingAssembly();
        using var stream = assembly.GetManifestResourceStream(resourceName);
        if (stream is null)
        {
            return null;
        }

        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
