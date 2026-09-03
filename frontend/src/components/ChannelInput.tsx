type ChannelInputProps = {
  channel: number;
  onChangeChannel: (channel: number) => void;
};

function ChannelInput({ channel, onChangeChannel }: ChannelInputProps) {
  return (
    <label className="inline-flex items-center gap-2 text-gray-900">
      <input
        type="number"
        min={0}
        value={channel}
        onChange={(e) => onChangeChannel(Math.max(0, Number(e.target.value)))}
        className="w-16 rounded-md border border-gray-300 bg-white px-2 py-2"
      />
    </label>
  );
}

export default ChannelInput;
