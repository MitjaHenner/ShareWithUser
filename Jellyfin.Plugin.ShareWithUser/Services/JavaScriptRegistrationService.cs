using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.Loader;
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
    /// </summary>
    public void RegisterContextMenuScript()
    {
        var script = LoadEmbeddedScript("Jellyfin.Plugin.ShareWithUser.Scripts.context-menu.js");
        if (script is null)
        {
            _logger.LogWarning("Failed to load context-menu.js embedded resource.");
            return;
        }

        try
        {
            var jsInjectorAssembly = AssemblyLoadContext.All
                .SelectMany(x => x.Assemblies)
                .FirstOrDefault(x => x.FullName?.Contains("Jellyfin.Plugin.JavaScriptInjector", StringComparison.Ordinal) ?? false);

            if (jsInjectorAssembly is null)
            {
                _logger.LogInformation("JavaScript Injector plugin not found — context menu item will not appear.");
                return;
            }

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
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to register context menu script with JavaScript Injector.");
        }
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
