using System;
using System.Collections.Generic;
using System.Globalization;
using Jellyfin.Plugin.ShareWithUser.Configuration;
using Jellyfin.Plugin.ShareWithUser.Services;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.ShareWithUser;

/// <summary>
/// The main plugin.
/// </summary>
#pragma warning disable CA1001 // Type owns disposable field but is not disposable (disposed in OnUninstalling)
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
#pragma warning restore CA1001
{
    private readonly ILogger<Plugin> _logger;
    private readonly JavaScriptRegistrationService _jsRegistration;

    /// <summary>
    /// Initializes a new instance of the <see cref="Plugin"/> class.
    /// </summary>
    /// <param name="applicationPaths">Instance of the <see cref="IApplicationPaths"/> interface.</param>
    /// <param name="xmlSerializer">Instance of the <see cref="IXmlSerializer"/> interface.</param>
    /// <param name="logger">Instance of the <see cref="ILogger{Plugin}"/> interface.</param>
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer, ILogger<Plugin> logger)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
        _logger = logger;
        _jsRegistration = new JavaScriptRegistrationService(logger, this);
        ConfigurationChanged += OnConfigurationChanged;

        if (Configuration.IsEnabled)
        {
            _jsRegistration.RegisterContextMenuScript();
        }
        else
        {
            _logger.LogInformation("ShareWithUser plugin loaded but disabled by configuration.");
        }

        _logger.LogInformation("ShareWithUser plugin loaded (Id={Id}, Version={Version}).", Id, Version);
    }

    /// <inheritdoc />
    public override string Name => "ShareWithUser";

    /// <inheritdoc />
    public override Guid Id => Guid.Parse("d5b7527c-3c98-4813-8fe7-ce7b31022c53");

    /// <summary>
    /// Gets the current plugin instance.
    /// </summary>
    public static Plugin? Instance { get; private set; }

    /// <inheritdoc />
    public IEnumerable<PluginPageInfo> GetPages()
    {
        return
        [
            new PluginPageInfo
            {
                Name = Name,
                EmbeddedResourcePath = string.Format(CultureInfo.InvariantCulture, "{0}.Configuration.configPage.html", GetType().Namespace)
            }
        ];
    }

    /// <inheritdoc />
    public override void OnUninstalling()
    {
        ConfigurationChanged -= OnConfigurationChanged;
        _jsRegistration.UnregisterScripts();
        _jsRegistration.Dispose();
        base.OnUninstalling();
    }

    private void OnConfigurationChanged(object? sender, BasePluginConfiguration config)
    {
        if (sender is not Plugin plugin || plugin != this)
        {
            return;
        }

        if (config is not PluginConfiguration pluginConfig)
        {
            return;
        }

        if (pluginConfig.IsEnabled)
        {
            _logger.LogInformation("ShareWithUser plugin enabled via configuration.");
            _jsRegistration.RegisterContextMenuScript();
        }
        else
        {
            _logger.LogInformation("ShareWithUser plugin disabled via configuration.");
            _jsRegistration.UnregisterScripts();
        }
    }
}
