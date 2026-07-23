targetScope = 'resourceGroup'

@description('Short lowercase environment prefix used in Azure resource names.')
@minLength(3)
@maxLength(16)
param prefix string = 'clinixai-lit-stg'

@description('Azure region for the validation environment.')
param location string = resourceGroup().location

@description('Container image. The first deployment may use the public bootstrap image.')
param containerImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('PostgreSQL administrator login.')
param postgresAdminLogin string = 'clinixaiadmin'

@secure()
@description('URL-safe PostgreSQL administrator password.')
param postgresAdminPassword string

@secure()
@description('Groq API key stored as a Container Apps secret.')
param groqApiKey string

@secure()
@description('Random monitoring token containing at least 32 characters.')
param internalMonitoringToken string

@description('Immutable application version.')
param releaseVersion string = '0.1.0'

@description('Immutable Git commit SHA represented by the image.')
param buildSha string = 'bootstrap'

@description('Keep one replica available for validation. Increase only after load validation.')
@minValue(1)
@maxValue(3)
param minReplicas int = 1

@description('Maximum validation replicas.')
@minValue(1)
@maxValue(5)
param maxReplicas int = 2

var safePrefix = toLower(replace(prefix, '-', ''))
var suffix = uniqueString(subscription().id, resourceGroup().id, prefix)
var acrName = take('${safePrefix}${suffix}', 50)
var environmentName = '${prefix}-env'
var appName = '${prefix}-app'
var migrationJobName = '${prefix}-migrate'
var postgresName = take('${prefix}-pg-${suffix}', 63)
var databaseName = 'clinixai'
var workspaceName = '${prefix}-logs'
var vnetName = '${prefix}-vnet'
var databaseUrl = 'postgresql://${postgresAdminLogin}:${postgresAdminPassword}@${postgresName}.postgres.database.azure.com:5432/${databaseName}'

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: workspaceName
  location: location
  properties: {
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    policies: {
      retentionPolicy: {
        days: 7
        status: 'enabled'
      }
    }
  }
}

resource vnet 'Microsoft.Network/virtualNetworks@2024-01-01' = {
  name: vnetName
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.20.0.0/16'
      ]
    }
    subnets: [
      {
        name: 'container-apps'
        properties: {
          addressPrefix: '10.20.0.0/23'
          delegations: [
            {
              name: 'container-apps-delegation'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
        }
      }
      {
        name: 'postgres'
        properties: {
          addressPrefix: '10.20.2.0/24'
          delegations: [
            {
              name: 'postgres-delegation'
              properties: {
                serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
              }
            }
          ]
        }
      }
    ]
  }
}

resource privateDns 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'privatelink.postgres.database.azure.com'
  location: 'global'
}

resource privateDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: privateDns
  name: '${prefix}-postgres-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: postgresName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: 32
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      delegatedSubnetResourceId: resourceId('Microsoft.Network/virtualNetworks/subnets', vnet.name, 'postgres')
      privateDnsZoneArmResourceId: privateDns.id
      publicNetworkAccess: 'Disabled'
    }
  }
  dependsOn: [
    privateDnsLink
  ]
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: databaseName
  properties: {}
}

resource extensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: postgres
  name: 'azure.extensions'
  properties: {
    source: 'user-override'
    value: 'VECTOR'
  }
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: environmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspace.properties.customerId
        sharedKey: workspace.listKeys().primarySharedKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: resourceId('Microsoft.Network/virtualNetworks/subnets', vnet.name, 'container-apps')
      internal: false
    }
  }
}

var releaseBaseUrl = 'https://${appName}.${environment.properties.defaultDomain}'
var commonEnvironment = [
  {
    name: 'NODE_ENV'
    value: 'production'
  }
  {
    name: 'APP_NAME'
    value: 'ClinixAI Literature Screening'
  }
  {
    name: 'APP_VERSION'
    value: releaseVersion
  }
  {
    name: 'APP_REGION'
    value: location
  }
  {
    name: 'DATABASE_URL'
    secretRef: 'database-url'
  }
  {
    name: 'DATABASE_SSL_MODE'
    value: 'require'
  }
  {
    name: 'DATABASE_POOL_MIN'
    value: '0'
  }
  {
    name: 'DATABASE_POOL_MAX'
    value: '10'
  }
  {
    name: 'AI_PROVIDER'
    value: 'groq'
  }
  {
    name: 'GROQ_API_KEY'
    secretRef: 'groq-api-key'
  }
  {
    name: 'GROQ_MODEL'
    value: 'llama-3.3-70b-versatile'
  }
  {
    name: 'EVIDENCE_STORE_BACKEND'
    value: 'database'
  }
  {
    name: 'KNOWLEDGE_ROOT'
    value: '/app/knowledge'
  }
  {
    name: 'CLINIXAI_KNOWLEDGE_ROOT'
    value: '/app/knowledge'
  }
  {
    name: 'INTERNAL_MONITORING_TOKEN'
    secretRef: 'monitoring-token'
  }
  {
    name: 'BUILD_SHA'
    value: buildSha
  }
  {
    name: 'RELEASE_VERSION'
    value: releaseVersion
  }
  {
    name: 'RELEASE_BASE_URL'
    value: releaseBaseUrl
  }
  {
    name: 'ALLOW_DEMO_PRINCIPAL'
    value: 'false'
  }
  {
    name: 'DEFAULT_TENANT_KEY'
    value: 'demo-tenant'
  }
  {
    name: 'PORT'
    value: '3000'
  }
  {
    name: 'HOSTNAME'
    value: '0.0.0.0'
  }
]

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        allowInsecure: false
        targetPort: 3000
        transport: 'auto'
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      registries: contains(containerImage, '.azurecr.io/')
        ? [
            {
              server: registry.properties.loginServer
              identity: 'system'
            }
          ]
        : []
      secrets: [
        {
          name: 'database-url'
          value: databaseUrl
        }
        {
          name: 'groq-api-key'
          value: groqApiKey
        }
        {
          name: 'monitoring-token'
          value: internalMonitoringToken
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'clinixai-literature'
          image: containerImage
          env: commonEnvironment
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/health/live'
                port: 3000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 30
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/health/ready'
                port: 3000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 20
              periodSeconds: 15
              timeoutSeconds: 5
              failureThreshold: 6
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-concurrency'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
  dependsOn: [
    database
    extensions
  ]
}

resource migrationJob 'Microsoft.App/jobs@2024-03-01' = {
  name: migrationJobName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    environmentId: environment.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 1800
      replicaRetryLimit: 1
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: contains(containerImage, '.azurecr.io/')
        ? [
            {
              server: registry.properties.loginServer
              identity: 'system'
            }
          ]
        : []
      secrets: [
        {
          name: 'database-url'
          value: databaseUrl
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'migration'
          image: containerImage
          command: [
            'node'
          ]
          args: [
            'scripts/run-database-migrations.mjs'
          ]
          env: [
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'DATABASE_SSL_MODE'
              value: 'require'
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
    }
  }
  dependsOn: [
    database
    extensions
  ]
}

var acrPullRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d'
)

resource appAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, app.id, 'AcrPull')
  scope: registry
  properties: {
    principalId: app.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleDefinitionId
  }
}

resource jobAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, migrationJob.id, 'AcrPull')
  scope: registry
  properties: {
    principalId: migrationJob.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleDefinitionId
  }
}

output applicationName string = app.name
output applicationUrl string = releaseBaseUrl
output containerRegistryName string = registry.name
output containerRegistryLoginServer string = registry.properties.loginServer
output migrationJobName string = migrationJob.name
output postgresServerName string = postgres.name
output postgresFqdn string = postgres.properties.fullyQualifiedDomainName
output environmentName string = environment.name
