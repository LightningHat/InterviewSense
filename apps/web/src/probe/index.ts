import { Capabilities, RuntimeProfile } from '@interviewsense/schemas';

export async function probeCapabilities(): Promise<Capabilities> {
  // 1. WebGPU check
  let webgpu = false;
  if (typeof navigator !== 'undefined' && 'gpu' in navigator && (navigator as any).gpu) {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      webgpu = adapter !== null && adapter !== undefined;
    } catch {
      webgpu = false;
    }
  }

  // 2. Device Memory
  const deviceMemoryGB =
    typeof navigator !== 'undefined' && 'deviceMemory' in navigator
      ? (navigator as any).deviceMemory ?? null
      : null;

  // 3. Hardware Concurrency
  const hardwareConcurrency =
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4;

  // 4. Mobile Check
  let isMobile = false;
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent || '';
    isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
      (typeof window !== 'undefined' && window.innerWidth <= 768 && 'ontouchstart' in window);
  }

  // 5. Microphone permission check
  let micPermission: 'granted' | 'prompt' | 'denied' = 'prompt';
  if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      micPermission = (status.state as 'granted' | 'prompt' | 'denied') || 'prompt';
    } catch {
      micPermission = 'prompt';
    }
  }

  // 6. SpeechSynthesis check
  const speechSynthesis = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // 7. IndexedDB check
  const indexedDB = typeof window !== 'undefined' && 'indexedDB' in window;

  return {
    webgpu,
    deviceMemoryGB,
    hardwareConcurrency,
    isMobile,
    micPermission,
    speechSynthesis,
    indexedDB,
  };
}

export function selectRuntimeProfile(
  capabilities: Capabilities,
  urlSearchParams?: URLSearchParams
): RuntimeProfile {
  const params =
    urlSearchParams ||
    (typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams());

  // 1. Developer query parameter override: ?profile=
  const override = params.get('profile');
  if (
    override === 'local-gpu' ||
    override === 'local-cpu' ||
    override === 'thin' ||
    override === 'dev'
  ) {
    return override;
  }

  // 2. Dev flag: ?dev=ollama
  if (params.get('dev') === 'ollama') {
    return 'dev';
  }

  // 3. local-gpu: webgpu and memory >= 8 GB and not mobile
  // Note: if deviceMemoryGB is null on desktop with WebGPU and high cores (>= 8), qualify as local-gpu
  const memoryQualifies =
    capabilities.deviceMemoryGB !== null
      ? capabilities.deviceMemoryGB >= 8
      : capabilities.hardwareConcurrency >= 8;

  if (capabilities.webgpu && memoryQualifies && !capabilities.isMobile) {
    return 'local-gpu';
  }

  // 4. local-cpu: no webgpu, desktop, >= 4 cores
  if (!capabilities.isMobile && capabilities.hardwareConcurrency >= 4) {
    return 'local-cpu';
  }

  // 5. Default fallback: thin
  return 'thin';
}

export function fallbackProfile(current: RuntimeProfile): RuntimeProfile {
  switch (current) {
    case 'dev':
      return 'local-gpu';
    case 'local-gpu':
      return 'local-cpu';
    case 'local-cpu':
      return 'thin';
    case 'thin':
      return 'thin';
  }
}

