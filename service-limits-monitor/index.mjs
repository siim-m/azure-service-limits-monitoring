import { ManagedIdentityCredential } from '@azure/identity';
import fetch from 'node-fetch';
import appInsights from 'applicationinsights';

appInsights.setup();
const client = appInsights.defaultClient;

const credential = new ManagedIdentityCredential('498536b2-9bd2-4fb4-bed9-f781f0f7f9c2');

export default async function (context, req) {
  const operationIdOverride = {
    'ai.operation.id': context.traceContext.traceparent,
  };

  const token = (await credential.getToken(`https://management.azure.com/`)).token;

  try {
    const customEvents = [];

    const subscriptions = await (
      await fetch('https://management.azure.com/subscriptions?api-version=2020-01-01', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
    ).json();

    for (const subscription of subscriptions.value) {
      const rbac = await (
        await fetch(
          `https://management.azure.com/subscriptions/${subscription.subscriptionId}/providers/Microsoft.Authorization/roleassignmentsusagemetrics?api-version=2019-08-01-preview`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        )
      ).json();
      const compute = await (
        await fetch(
          `https://management.azure.com/subscriptions/${subscription.subscriptionId}/providers/Microsoft.Compute/locations/australiaeast/usages?api-version=2022-03-01`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        )
      ).json();

      customEvents.push({
        name: 'Number of Role Assignments',
        subscriptionName: subscription.displayName,
        subscriptionId: subscription.subscriptionId,
        currentValue: rbac.roleAssignmentsCurrentCount,
        limit: rbac.roleAssignmentsLimit,
      });

      compute.value.forEach((item) => {
        customEvents.push({
          name: item.name.localizedValue,
          subscriptionName: subscription.displayName,
          subscriptionId: subscription.subscriptionId,
          currentValue: item.currentValue,
          limit: item.limit,
        });
      });
    }

    customEvents.forEach((event) => {
      client.trackEvent({
        name: 'serviceLimitsUsage',
        tagOverrides: operationIdOverride,
        properties: event,
      });
    });
  } catch (err) {
    context.log('err', err);
  }
}
