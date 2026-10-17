import test from 'node:test';
import assert from 'node:assert/strict';
import { createComfyPreset, COMFY_PRESETS } from '../src/comfyPresets.js';
import { compilePrompt } from '../src/comfyGraph.js';
import { CORE_NODES, nodeGroup } from '../../shared/comfyNodes.mjs';
const port = type => [type];
const number = (value, min = 0) => ['INT', { default: value, min }];
const info = (input, output = [], output_node = false) => ({ input: { required: input }, output, output_node });
const catalog = {
    CheckpointLoaderSimple: info({ ckpt_name: [['model.safetensors']] }, ['MODEL', 'CLIP', 'VAE']),
    CLIPTextEncode: info({ clip: port('CLIP'), text: ['STRING', { default: '' }] }, ['CONDITIONING']),
    EmptyLatentImage: info({ width: number(512, 16), height: number(512, 16), batch_size: number(1, 1) }, ['LATENT']),
    KSampler: info({ model: port('MODEL'), positive: port('CONDITIONING'), negative: port('CONDITIONING'), latent_image: port('LATENT'), seed: number(0), steps: number(20, 1), cfg: ['FLOAT', { default: 8, min: 0 }], denoise: ['FLOAT', { default: 1, min: 0, max: 1 }], sampler_name: [['euler']], scheduler: [['normal']] }, ['LATENT']),
    VAEDecode: info({ samples: port('LATENT'), vae: port('VAE') }, ['IMAGE']),
    VAEEncode: info({ pixels: port('IMAGE'), vae: port('VAE') }, ['LATENT']),
    VAEEncodeForInpaint: info({ pixels: port('IMAGE'), vae: port('VAE'), mask: port('MASK'), grow_mask_by: number(6) }, ['LATENT']),
    SaveImage: info({ images: port('IMAGE'), filename_prefix: ['STRING', { default: 'ComfyUI' }] }, [], true),
    LoadImage: info({ image: [['input.png']] }, ['IMAGE', 'MASK']),
    UpscaleModelLoader: info({ model_name: [['upscale.pth']] }, ['UPSCALE_MODEL']),
    ImageUpscaleWithModel: info({ image: port('IMAGE'), upscale_model: port('UPSCALE_MODEL') }, ['IMAGE'])
};
catalog.LoraLoader = info({ model: port('MODEL'), clip: port('CLIP'), lora_name: [['test.safetensors']], strength_model: ['FLOAT', { default: 1 }], strength_clip: ['FLOAT', { default: 1 }] }, ['MODEL', 'CLIP']);
catalog.ControlNetLoader = info({ control_net_name: [['control.safetensors']] }, ['CONTROL_NET']);
catalog.ControlNetApplyAdvanced = info({ positive: port('CONDITIONING'), negative: port('CONDITIONING'), control_net: port('CONTROL_NET'), image: port('IMAGE'), strength: ['FLOAT', { default: 1 }], start_percent: ['FLOAT', { default: 0 }], end_percent: ['FLOAT', { default: 1 }] }, ['CONDITIONING', 'CONDITIONING']);
catalog.ControlNetApplyAdvanced.input.optional = { vae: port('VAE') };
test('All presets produce runnable typed graphs with unique identifiers', () => {
    let id = 0;
    for (const preset of COMFY_PRESETS) {
        const graph = createComfyPreset(preset.id, catalog, () => String(++id));
        const prompt = compilePrompt(graph, catalog);
        assert.equal(new Set([...graph.nodes, ...graph.edges].map(x => x.id)).size, graph.nodes.length + graph.edges.length);
        assert.equal(Object.values(prompt).filter(n => n.class_type === 'SaveImage').length, 1);
        const sampler = Object.values(prompt).find(n => n.class_type === 'KSampler');
        if (sampler) assert.equal(sampler.inputs.denoise, preset.id === 'image' ? 0.6 : 1);
        if (preset.id === 'lora') assert.equal(prompt[sampler.inputs.model[0]].class_type, 'LoraLoader');
        if (preset.id === 'control') {
            assert.equal(prompt[sampler.inputs.positive[0]].class_type, 'ControlNetApplyAdvanced');
            assert.equal(sampler.inputs.negative[1], 1);
            assert(prompt[sampler.inputs.positive[0]].inputs.vae);
        }
        if (preset.id === 'inpaint') {
            const encoder = Object.values(prompt).find(n => n.class_type === 'VAEEncodeForInpaint');
            assert.equal(prompt[encoder.inputs.mask[0]].class_type, 'LoadImage');
            assert.equal(encoder.inputs.mask[1], 1);
        }
    }
});
test('Unavailable nodes and empty model selections are reported instead of guessed', () => {
    let id = 0;
    const missing = { ...catalog }; delete missing.KSampler;
    assert.throws(() => createComfyPreset('text', missing, () => String(++id)), /缺少节点.*KSampler/);
    const empty = structuredClone(catalog); empty.CheckpointLoaderSimple.input.required.ckpt_name = [[]];
    assert.throws(() => createComfyPreset('text', empty, () => String(++id)), /参数无效/);
});
test('Primary node manifest is unique, categorized and contains major image pipeline nodes', () => {
    assert.equal(new Set(CORE_NODES).size, CORE_NODES.length);
    for (const name of ['UNETLoader', 'CLIPLoader', 'ConditioningSetMask', 'LatentUpscale', 'VAEDecodeTiled', 'ControlNetApplyAdvanced']) {
        assert(CORE_NODES.includes(name)); assert.notEqual(nodeGroup(name), '其他节点');
    }
});
