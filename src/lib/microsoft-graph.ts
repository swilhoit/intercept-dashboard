import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import { AuthenticationProvider } from '@microsoft/microsoft-graph-client';

class ClientCredentialAuthProvider implements AuthenticationProvider {
  private clientApp: ConfidentialClientApplication | null = null;

  private initializeClient() {
    if (!this.clientApp) {
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
      const tenantId = process.env.MICROSOFT_TENANT_ID;

      if (!clientId || !clientSecret || !tenantId) {
        throw new Error('Microsoft Graph credentials not configured');
      }

      this.clientApp = new ConfidentialClientApplication({
        auth: {
          clientId,
          clientSecret,
          authority: `https://login.microsoftonline.com/${tenantId}`,
        },
      });
    }
    return this.clientApp;
  }

  async getAccessToken(): Promise<string> {
    const clientApp = this.initializeClient();
    const clientCredentialRequest = {
      scopes: ['https://graph.microsoft.com/.default'],
    };

    try {
      const response = await clientApp.acquireTokenByClientCredential(clientCredentialRequest);
      return response?.accessToken || '';
    } catch (error) {
      console.error('Error acquiring token:', error);
      throw error;
    }
  }
}

let graphClient: Client | null = null;

export function getGraphClient(): Client {
  // Validate credentials before creating client
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenantId = process.env.MICROSOFT_TENANT_ID;

  if (!clientId || !clientSecret || !tenantId) {
    throw new Error('Microsoft Graph credentials not configured. Please set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_TENANT_ID environment variables.');
  }

  if (!graphClient) {
    const authProvider = new ClientCredentialAuthProvider();
    graphClient = Client.initWithMiddleware({
      authProvider: authProvider,
    });
  }
  return graphClient;
}