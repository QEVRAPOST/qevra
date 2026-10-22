import type { ResearchTopicId } from "@/types/integrations";

export const DEFAULT_RESEARCH_TOPIC_ID: ResearchTopicId = "robinhood-readonly-wallet";

export interface ResearchTopicDefinition {
  id: ResearchTopicId;
  label: string;
  defaultQuestion: string;
  sourceIds: string[];
}

export interface ApprovedSourceDefinition {
  id: string;
  title: string;
  url: string;
  allowedHost: string;
}

export const approvedSources: Record<string, ApprovedSourceDefinition> = {
  "nist-fips-204": {
    id: "nist-fips-204",
    title: "NIST FIPS 204: Module-Lattice-Based Digital Signature Standard",
    url: "https://csrc.nist.gov/pubs/fips/204/final",
    allowedHost: "csrc.nist.gov",
  },
  "nist-pqc-project": {
    id: "nist-pqc-project",
    title: "NIST Post-Quantum Cryptography Project",
    url: "https://csrc.nist.gov/projects/post-quantum-cryptography",
    allowedHost: "csrc.nist.gov",
  },
  "robinhood-chain-docs": {
    id: "robinhood-chain-docs",
    title: "Robinhood Chain developer documentation",
    url: "https://docs.robinhood.com/chain/connecting/",
    allowedHost: "docs.robinhood.com",
  },
};

export const researchTopics: Record<ResearchTopicId, ResearchTopicDefinition> = {
  "mldsa-key-registration": {
    id: "mldsa-key-registration",
    label: "ML-DSA key registration and authorization",
    defaultQuestion:
      "What security properties and encoding requirements does FIPS 204 define for ML-DSA public keys and signatures, and what must an application verify before authorizing a key?",
    sourceIds: ["nist-fips-204", "nist-pqc-project"],
  },
  "robinhood-readonly-wallet": {
    id: "robinhood-readonly-wallet",
    label: "Robinhood Chain read-only wallet integration",
    defaultQuestion:
      "What public network and JSON-RPC information is documented for Robinhood Chain, and what can a read-only wallet integration safely display without signing or submitting transactions?",
    sourceIds: ["robinhood-chain-docs"],
  },
  "security-evidence": {
    id: "security-evidence",
    label: "Security evidence and deterministic experiments",
    defaultQuestion:
      "How should claims about post-quantum authorization vulnerabilities be separated from independently reproducible evidence, standards text, and unverified assumptions?",
    sourceIds: ["nist-fips-204", "nist-pqc-project"],
  },
};

export function resolveResearchTopic(topicId: ResearchTopicId, question?: string) {
  const definition = researchTopics[topicId];
  return {
    ...definition,
    question: question?.trim() || definition.defaultQuestion,
    sources: definition.sourceIds.map((id) => approvedSources[id]),
  };
}
