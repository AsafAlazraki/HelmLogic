'use server';

export async function proxyFetch(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { success: false, error: `Failed to fetch: ${response.status} ${response.statusText}` };
    }
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      return { success: true, data };
    } else {
      const text = await response.text();
      return { success: true, data: text };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
