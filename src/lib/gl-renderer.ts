/** Software renderers (SwiftShader, llvmpipe, Windows' basic adapter) are slower than running the model on the CPU. */
export const isHardwareRenderer = (renderer: string) => !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
