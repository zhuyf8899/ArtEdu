import { nodeFromInfo, compilePrompt } from './comfyGraph.js';

export const COMFY_PRESETS = [
    { id: 'text', label: '文生图', required: ['CheckpointLoaderSimple', 'CLIPTextEncode', 'EmptyLatentImage', 'KSampler', 'VAEDecode', 'SaveImage'] },
    { id: 'lora', label: 'LoRA 文生图', required: ['CheckpointLoaderSimple', 'LoraLoader', 'CLIPTextEncode', 'EmptyLatentImage', 'KSampler', 'VAEDecode', 'SaveImage'] },
    { id: 'control', label: 'ControlNet 引导生图', required: ['CheckpointLoaderSimple', 'ControlNetLoader', 'ControlNetApplyAdvanced', 'LoadImage', 'CLIPTextEncode', 'EmptyLatentImage', 'KSampler', 'VAEDecode', 'SaveImage'] },
    { id: 'image', label: '图生图', required: ['CheckpointLoaderSimple', 'CLIPTextEncode', 'LoadImage', 'VAEEncode', 'KSampler', 'VAEDecode', 'SaveImage'] },
    { id: 'inpaint', label: '局部重绘（图片透明区域）', required: ['CheckpointLoaderSimple', 'CLIPTextEncode', 'LoadImage', 'VAEEncodeForInpaint', 'KSampler', 'VAEDecode', 'SaveImage'] },
    { id: 'upscale', label: '模型放大', required: ['LoadImage', 'UpscaleModelLoader', 'ImageUpscaleWithModel', 'SaveImage'] }
];
export function createComfyPreset(kind, catalog, makeId) {
    const preset = COMFY_PRESETS.find(p => p.id === kind);
    if (!preset) throw new Error('未知节点模板');
    const missing = preset.required.filter(name => !catalog[name]);
    if (missing.length) throw new Error(`模板缺少节点：${missing.join('、')}`);
    const nodes = [], edges = [];
    const add = (type, x, y, widgets = {}) => {
        const node = nodeFromInfo(makeId(), type, catalog[type], { x, y });
        for (const [name, value] of Object.entries(widgets)) {
            const spec = catalog[type].input?.required?.[name] || catalog[type].input?.optional?.[name];
            if (spec) node.data.widgets[name] = value;
        }
        nodes.push(node); return node;
    };
    const link = (source, slot, target, name) => edges.push({ id: makeId(), source: source.id, sourceHandle: String(slot), target: target.id, targetHandle: name });
    if (kind === 'upscale') {
        const image = add('LoadImage', 0, 0), model = add('UpscaleModelLoader', 0, 420);
        const scale = add('ImageUpscaleWithModel', 330, 0), save = add('SaveImage', 660, 0);
        link(image, 0, scale, 'image'); link(model, 0, scale, 'upscale_model'); link(scale, 0, save, 'images');
    } else {
        const checkpoint = add('CheckpointLoaderSimple', 0, 0);
        let model = checkpoint, modelSlot = 0, clip = checkpoint, clipSlot = 1;
        if (kind === 'lora') {
            const lora = add('LoraLoader', 0, 420);
            link(checkpoint, 0, lora, 'model'); link(checkpoint, 1, lora, 'clip');
            model = lora; clip = lora;
        }
        const positive = add('CLIPTextEncode', 330, 0, { text: 'a watercolor flower, detailed, soft light' });
        const negative = add('CLIPTextEncode', 330, 320, { text: 'blurry, watermark, text' });
        link(clip, clipSlot, positive, 'clip'); link(clip, clipSlot, negative, 'clip');
        let conditioning = null;
        if (kind === 'control') {
            const loader = add('ControlNetLoader', 0, 420), image = add('LoadImage', 0, 740);
            conditioning = add('ControlNetApplyAdvanced', 660, 640);
            link(loader, 0, conditioning, 'control_net'); link(image, 0, conditioning, 'image');
            link(positive, 0, conditioning, 'positive'); link(negative, 0, conditioning, 'negative');
            if (catalog.ControlNetApplyAdvanced.input?.optional?.vae || catalog.ControlNetApplyAdvanced.input?.required?.vae) link(checkpoint, 2, conditioning, 'vae');
        }
        let latent;
        if (['text', 'lora', 'control'].includes(kind)) latent = add('EmptyLatentImage', 330, 640, { width: 512, height: 512, batch_size: 1 });
        else {
            const image = add('LoadImage', 0, 420);
            latent = add(kind === 'inpaint' ? 'VAEEncodeForInpaint' : 'VAEEncode', 330, 640);
            link(image, 0, latent, 'pixels'); link(checkpoint, 2, latent, 'vae');
            if (kind === 'inpaint') link(image, 1, latent, 'mask');
        }
        const sampler = add('KSampler', 660, 0, { seed: 1, steps: 20, cfg: 7, denoise: kind === 'image' ? 0.6 : 1 });
        const decode = add('VAEDecode', 990, 0), save = add('SaveImage', 1320, 0);
        link(model, modelSlot, sampler, 'model'); link(conditioning || positive, 0, sampler, 'positive'); link(conditioning || negative, conditioning ? 1 : 0, sampler, 'negative'); link(latent, 0, sampler, 'latent_image');
        link(sampler, 0, decode, 'samples'); link(checkpoint, 2, decode, 'vae'); link(decode, 0, save, 'images');
    }
    const graph = { schemaVersion: 2, engine: 'comfyui', nodes, edges, groups: [], viewport: { x: 0, y: 0, zoom: 1 } };
    // Missing model or image enum choices must fail, never create a fake usable template.
    compilePrompt(graph, catalog);
    return graph;
}
