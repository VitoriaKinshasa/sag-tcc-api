/** Erro de regra de negócio, devolvido ao cliente com o código HTTP e a regra violada. */
export class ErroNegocio extends Error {
  constructor(
    public readonly status: number,
    mensagem: string,
    public readonly regra?: string,
  ) {
    super(mensagem);
  }
}

export const naoEncontrado = (o_que: string) => new ErroNegocio(404, `${o_que} não encontrado(a)`);
export const proibido = (mensagem = 'Você não tem permissão para esta ação') => new ErroNegocio(403, mensagem, 'RNF05');
