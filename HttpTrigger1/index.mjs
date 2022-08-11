import { DefaultAzureCredential } from '@azure/identity';
import fetch from 'node-fetch';
import appInsights from 'applicationinsights';

appInsights.setup();
const client = appInsights.defaultClient;

const subscriptionId = 'e478e4ae-eb96-45e6-8949-ff9209576dc3';
const urlRbac = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleassignmentsusagemetrics?api-version=2019-08-01-preview`;
const urlCompute = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Compute/locations/australiaeast/usages?api-version=2022-03-01`;

export default async function (context, req) {
  const operationIdOverride = {
    'ai.operation.id': context.traceContext.traceparent,
  };

  const credential = new DefaultAzureCredential();
  const token = (await credential.getToken(`https://management.azure.com/`)).token;

  try {
    const rbac = await (
      await fetch(urlRbac, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
    ).json();

    const compute = await (
      await fetch(urlCompute, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
    ).json();

    const customEvents = [
      {
        subscriptionId: subscriptionId,
        name: 'Number of Role Assignments',
        currentValue: rbac.roleAssignmentsCurrentCount,
        limit: rbac.roleAssignmentsLimit,
      },
    ];

    compute.value.forEach((item) => {
      customEvents.push({
        subscriptionId: subscriptionId,
        name: item.name.localizedValue,
        currentValue: item.currentValue,
        limit: item.limit,
      });
    });

    customEvents.forEach((event) => {
      client.trackEvent({
        name: 'serviceLimitsUsage',
        tagOverrides: operationIdOverride,
        properties: event,
      });
    });

    context.res = {
      body: customEvents,
    };
  } catch (err) {
    context.log('err', err);
    context.res = {
      status: 400,
      body: err,
    };
  }
}
