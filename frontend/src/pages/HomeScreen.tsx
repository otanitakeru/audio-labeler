import FilePicker from '../components/FilePicker'
import { useAudioSession } from '../hooks/useAudioSession'

function HomeScreen() {
  const { filename, isUploading, error, uploadFile } = useAudioSession()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <FilePicker filename={filename} isUploading={isUploading} onFileSelected={uploadFile} />
      {error && <p className="m-0 text-sm text-red-600">{error}</p>}
    </div>
  )
}

export default HomeScreen
