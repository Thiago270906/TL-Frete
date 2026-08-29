import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * Confirmação de exclusão reutilizável. Sempre cita o NOME do item e a
 * contagem de dependentes que serão removidos junto (cascade no banco).
 */
export function ConfirmarExclusao({
  nome,
  dependentes,
  aoConfirmar,
  children,
}: {
  nome: string;
  dependentes?: { rotuloSingular: string; rotuloPlural: string; quantidade: number };
  aoConfirmar: () => void | Promise<void>;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const textoDependentes = (() => {
    if (!dependentes || dependentes.quantidade === 0) return null;
    const { quantidade, rotuloSingular, rotuloPlural } = dependentes;
    const rotulo = quantidade === 1 ? rotuloSingular : rotuloPlural;
    return `Isso também remove ${quantidade} ${rotulo} vinculado${
      quantidade === 1 ? "" : "s"
    }.`;
  })();

  async function confirmar() {
    try {
      setOcupado(true);
      await aoConfirmar();
      setAberto(false);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <AlertDialog open={aberto} onOpenChange={setAberto}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir “{nome}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação não pode ser desfeita. {textoDependentes}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={ocupado}
            onClick={(e) => {
              e.preventDefault();
              void confirmar();
            }}
          >
            {ocupado ? "Excluindo…" : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
