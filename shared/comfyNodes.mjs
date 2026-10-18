// Curated image workflow nodes. Definitions and model choices always come from object_info.
export const COMFY_NODE_GROUPS = {
    '模型加载': ['CheckpointLoaderSimple', 'UNETLoader', 'CLIPLoader', 'DualCLIPLoader', 'VAELoader', 'LoraLoader', 'LoraLoaderModelOnly', 'CLIPVisionLoader', 'StyleModelLoader'],
    '提示词与条件': ['CLIPTextEncode', 'CLIPSetLastLayer', 'ConditioningAverage', 'ConditioningCombine', 'ConditioningConcat', 'ConditioningSetArea', 'ConditioningSetAreaPercentage', 'ConditioningSetAreaStrength', 'ConditioningSetMask', 'ConditioningZeroOut', 'ConditioningSetTimestepRange', 'CLIPVisionEncode', 'StyleModelApply', 'unCLIPConditioning'],
    '采样与潜空间': ['KSampler', 'KSamplerAdvanced', 'EmptyLatentImage', 'LatentUpscale', 'LatentUpscaleBy', 'LatentFromBatch', 'RepeatLatentBatch', 'SetLatentNoiseMask', 'LatentComposite', 'LatentBlend', 'LatentRotate', 'LatentFlip', 'LatentCrop'],
    'VAE 与局部重绘': ['VAEEncode', 'VAEEncodeForInpaint', 'VAEDecode', 'VAEEncodeTiled', 'VAEDecodeTiled', 'InpaintModelConditioning'],
    '图片处理与输出': ['LoadImage', 'LoadImageMask', 'SaveImage', 'PreviewImage', 'EmptyImage', 'ImageScale', 'ImageScaleBy', 'ImageInvert', 'ImageBatch', 'ImagePadForOutpaint', 'UpscaleModelLoader', 'ImageUpscaleWithModel'],
    '遮罩': ['ImageToMask', 'MaskToImage', 'InvertMask', 'SolidMask', 'MaskComposite', 'CropMask', 'FeatherMask', 'GrowMask', 'ThresholdMask'],
    'ControlNet': ['ControlNetLoader', 'ControlNetApply', 'ControlNetApplyAdvanced', 'DiffControlNetLoader']
};
export const CORE_NODES = Object.values(COMFY_NODE_GROUPS).flat();
export function nodeGroup(name) {
    return Object.entries(COMFY_NODE_GROUPS).find(([, names]) => names.includes(name))?.[0] || '其他节点';
}
