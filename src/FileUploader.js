import { InboxOutlined } from "@ant-design/icons";
import "./FileUploader.css";
import { useRef } from "react";
import useDrag from "./useDrag";

function FileUploader() {
  const uploadContainerRef = useRef(null);
  const { selectedFile, filePreview } = useDrag(uploadContainerRef);
  return (
    <>
      <div className="upload-container" ref={uploadContainerRef}>
        {renderFilePrevire(filePreview)}
      </div>
    </>
  );
}
/**
 * 显示文件的预览信息
 * @param {*} filePreview
 */
function renderFilePrevire(filePreview) {
  const { url, type } = filePreview;
  if (url) {
    if (type.startsWith("video/")) {
      return <video src={url} controls />;
    } else if (type.startsWith("image/")) {
      return <img src={url} alt="preview" />;
    } else {
      return url;
    }
  } else {
    return <InboxOutlined />;
  }
}
export default FileUploader;
