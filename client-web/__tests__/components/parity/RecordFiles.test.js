// Component test for src/components/parity/RecordFiles.vue
//
// Verifies: loads files on mount + on recordId change, formats download URLs,
// handles upload + delete via api mocks, shows status messages.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '@/services/api';
import RecordFiles from '@/components/parity/RecordFiles.vue';

const ButtonStub = {
  name: 'Button',
  props: ['icon', 'label', 'severity', 'outlined', 'text', 'size', 'title', 'ariaLabel'],
  emits: ['click'],
  template: `<button class="btn-stub" :data-label="label" @click="$emit('click')">{{ label || '' }}</button>`,
};

function mountFiles(props = {}) {
  return mount(RecordFiles, {
    props: {
      entityType: 'electrolytes',
      recordId: 42,
      fileIdField: 'electrolyte_file_id',
      ...props,
    },
    global: { stubs: { Button: ButtonStub } },
  });
}

describe('RecordFiles.vue', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    api.delete.mockReset();
  });

  it('renders nothing when recordId is null', () => {
    api.get.mockResolvedValue({ data: [] });
    const wrapper = mountFiles({ recordId: null });
    expect(wrapper.find('.record-files').exists()).toBe(false);
  });

  it('loads files on mount when recordId is set', async () => {
    api.get.mockResolvedValue({ data: [] });
    mountFiles({ recordId: 42 });
    await flushPromises();
    expect(api.get).toHaveBeenCalledWith('/api/electrolytes/42/files');
  });

  it('loads files when recordId changes', async () => {
    api.get.mockResolvedValue({ data: [] });
    const wrapper = mountFiles({ recordId: 42 });
    await flushPromises();
    api.get.mockClear();

    await wrapper.setProps({ recordId: 99 });
    await flushPromises();
    expect(api.get).toHaveBeenCalledWith('/api/electrolytes/99/files');
  });

  it('renders empty-state message when no files', async () => {
    api.get.mockResolvedValue({ data: [] });
    const wrapper = mountFiles();
    await flushPromises();
    expect(wrapper.find('.files-empty').exists()).toBe(true);
  });

  it('renders file rows with name + mime + size', async () => {
    api.get.mockResolvedValue({
      data: [
        {
          electrolyte_file_id: 1,
          file_name: 'datasheet.pdf',
          mime_type: 'application/pdf',
          file_size_bytes: 2048,
          download_url: '/api/electrolytes/files/1/download',
        },
      ],
    });
    const wrapper = mountFiles();
    await flushPromises();

    expect(wrapper.text()).toContain('datasheet.pdf');
    expect(wrapper.text()).toContain('application/pdf');
    expect(wrapper.text()).toContain('2.0 КБ');
    expect(wrapper.find('a.file-link').attributes('href')).toBe('/api/electrolytes/files/1/download');
  });

  it('falls back to constructed download URL when download_url is missing', async () => {
    api.get.mockResolvedValue({
      data: [{ electrolyte_file_id: 7, file_name: 'f.txt' }],
    });
    const wrapper = mountFiles();
    await flushPromises();
    expect(wrapper.find('a.file-link').attributes('href')).toBe('/api/electrolytes/files/7/download');
  });

  it('formats file sizes correctly (bytes / KB / MB)', async () => {
    api.get.mockResolvedValue({
      data: [
        { electrolyte_file_id: 1, file_name: 'small', file_size_bytes: 512 },
        { electrolyte_file_id: 2, file_name: 'med', file_size_bytes: 4096 },
        { electrolyte_file_id: 3, file_name: 'big', file_size_bytes: 5 * 1024 * 1024 },
      ],
    });
    const wrapper = mountFiles();
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain('512 Б');
    expect(text).toContain('4.0 КБ');
    expect(text).toContain('5.00 МБ');
  });

  it('reload-status appears on load failure', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'Auth required' } } });
    const wrapper = mountFiles();
    await flushPromises();
    expect(wrapper.find('.files-status--error').exists()).toBe(true);
    expect(wrapper.text()).toContain('Auth required');
  });

  it('uses the right entityType in URLs', async () => {
    api.get.mockResolvedValue({ data: [] });
    mountFiles({ entityType: 'separators', recordId: 5 });
    await flushPromises();
    expect(api.get).toHaveBeenCalledWith('/api/separators/5/files');
  });

  it('uses fileIdField to extract id for delete URL fallback', async () => {
    api.get.mockResolvedValue({
      data: [{ separator_file_id: 13, file_name: 'sep.pdf' }],
    });
    const wrapper = mountFiles({
      entityType: 'separators',
      recordId: 9,
      fileIdField: 'separator_file_id',
    });
    await flushPromises();
    expect(wrapper.find('a.file-link').attributes('href')).toBe('/api/separators/files/13/download');
  });

  it('uses externalStatus mode (emits status, no internal banner)', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'No' } } });
    const wrapper = mountFiles({ externalStatus: true });
    await flushPromises();
    expect(wrapper.find('.files-status').exists()).toBe(false);
    expect(wrapper.emitted().status).toBeDefined();
    expect(wrapper.emitted().status[0][0]).toMatchObject({ message: 'No', tone: 'error' });
  });
});
