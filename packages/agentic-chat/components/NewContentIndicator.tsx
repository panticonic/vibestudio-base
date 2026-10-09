import { Button, Flex } from "@radix-ui/themes";
import { ArrowDownIcon } from "@radix-ui/react-icons";

interface NewContentIndicatorProps {
  onClick: () => void;
}

export function NewContentIndicator({ onClick }: NewContentIndicatorProps) {
  return (
    <Flex
      justify="center"
      className="new-content-indicator"
      style={{
        position: "absolute",
        bottom: 8,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 10,
      }}
    >
      <Button color="blue" size="2" variant="soft" onClick={onClick}>
        <ArrowDownIcon />
        New messages
      </Button>
    </Flex>
  );
}
